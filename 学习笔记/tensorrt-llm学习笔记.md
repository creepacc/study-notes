# 笔记（整理版）

> （由 tensorRT-llm.docx 重新排版整理：修正错误、规范层级；并依据已安装的 tensorrt_llm/builder.py 补全 model.config 与 build_config 的全部优化项）





## 一、推理优化相关

### 1.1 模型推理流程

#### 自回归生成

- 模型逐个预测下一个 token，并把历史输出重新拼回输入，迭代生成完整序列。

#### Prefill + Decode 两阶段

- Prefill：一次输入所有问题（prompt）的 token，并行计算，得到首 token。计算密集、并行度高。

- Decode：根据历史所有 token 串行地预测下一个 token。访存密集、并行度低（受显存带宽限制）。

### 1.2 KV cache

#### 原理

- 每轮预测只需输出下一个 token，此前 token 对应的 q 已不再起作用，只用得到之前各轮的 KV。

- 历史 KV 无需重新计算，直接取上一次的计算结果，把本次算出的 KV 与历史 KV 拼接即可。

- 因此 KV cache 省去了每轮重复计算历史 KV 的开销——以空间换时间。

#### 单个 Token 的 KV cache 占用


- L：网络层数（num_hidden_layers）。

- H(kv)：KV 头的数量——注意是 KV 头，不是 Query 头。

- d(head)：每个注意力头的维度。

- bytes：每个元素占用的字节数（fp16 = 2，bf16 = 2，fp32 = 4）。

- 系数 2：因为 K 与 V 各存一份。

#### KV cache 总量公式


- 在单个 Token 占用之上，再乘上批量大小（batch size）与序列长度（sequence length），即得整张 KV cache 的显存占用。

- 2 = K、V 各一份；层数 L 对应每个 decoder 层各有一组 KV；H(kv) 是 KV 头数（见下文 GQA / MQA）。

#### 浮点数表示（精度与量化基础）

- 计算机用浮点数表示小数，遵循 IEEE 754 标准，二进制布局为「符号位 + 指数位 + 小数位」三段：

| 字段 | 含义 |
| --- | --- |
| 符号位 | 决定正负：0 为正，1 为负 |
| 指数位 | 决定量级：指数部分的二进制编码，位数越多，表示范围越大 |
| 小数位 | 决定精度：尾数部分的二进制编码，位数越多，精度越高 |

- `示例：1.10101 × 2³ ——`即二进制尾数 1.10101 乘以 2 的 3 次方（指数 3 由指数位编码）。

- FP8 / FP16 / FP32 等格式正是通过固定指数位、小数位的长度来权衡「范围」与「精度」；量化相当于减少表示位数，故会引入精度损失。

#### 常用量化方案一览

- 理论上，weight 数值类型、activation 数值类型和矩阵量化粒度互相正交，可以任意组合；但工程实现中需综合考虑精度影响、性能收益、易用性，以及开发与维护难度等因素。TensorRT-LLM 支持以下常用量化方案：

| 名称 | Weight 类型 | Activation 类型 | 量化粒度 |
| --- | --- | --- | --- |
| FP8 | FP8 | FP8 | Per Tensor |
| INT8 Weight-Only | INT8 | FP16 | Per Channel |
| INT8 SmoothQuant | INT8 | INT8 | PerChannel + PerToken |
| INT4 Weight-Only | INT4 | FP16 | Per Channel |
| INT4 AWQ | INT4 | FP16 | Groupwise |
| INT4 GPTQ | INT4 | FP16 | Groupwise |

#### GQA / MQA

- 根据 H(kv) 的大小不同，可分为 GQA（分组查询注意力）与 MQA（多查询注意力）。

- MQA：所有 Q 头共用同一套 KV。极端省显存，但表达能力弱（“变笨”）。

- GQA：所有 Q 头分成若干组，每组用自己的一套 KV。是 MQA 与完整 MHA 之间的折中，现为大模型主流选择。

### 1.3 推理性能衡量

#### 延迟指标

- TTFT（Time To First Token，首 Token 延迟）：从用户提交请求到收到第一个 token 的时间，主要由 排队时间 + Prefill 时间 + 网络延迟 构成。

- TPOT（Time Per Output Token，每 Token 延迟），又称 ITL（Inter-Token Latency）：生成阶段平均每个输出 token 所花的时间，决定了文字的“吐字速度”（TPOT = 50 ms 时，用户看到的是约每秒 20 字）。

#### 吞吐指标

- Throughput：单位时间完成的请求数 / 生成的 token 数。不同口径适用不同视角：

| 指标 | 含义 | 适用视角 |
| --- | --- | --- |
| Token/s（系统） | 全系统每秒生成的总 Token 数 | 衡量集群整体产能与成本 |
| Token/s（单用户） | 单个用户感受到的出字速度 | 约等于 1/TPOT |
| RPS（Requests/s） | 每秒成功完成的请求数 | 衡量并发承载能力 |

#### 尾延迟与 Goodput

- 平均延迟最容易“骗人”：真实流量下少数请求可能慢得离谱，平均值会把它们藏起来，生产环境更应关注尾延迟。

- P50：中位数，一半请求比它快。

- P95 / P99：95% / 99% 的请求比它快——这才是用户投诉的主要来源。

- Goodput：有效产出吞吐，即剔除低质量 / 被拒绝结果后的“有用”吞吐，比裸 Throughput 更能反映体验。

## 二、torch 相关

### 2.1 大模型架构（以 LLaMA 为例）

- model.embed_tokens：输入嵌入层，把 token id 映射为高维向量（nn.Embedding，非线性映射）。

- `层内结构：`model.model.layers：核心计算单元，每层包含 sa（Self-Attention）与 mlp（Feed-Forward Network）两部分。

- `sa：q、k、v、o（输出投影）四组参数，`Attention(Q, K, V) = softmax(Q·K^T / √d) · V，其中 d 为头的维度。

- `mlp：up、gate、down 三组参数，`MLP(x) = down_proj( SiLU(gate_proj(x)) × up_proj(x) )。

- ffn_hidden_size：大模型 FFN（前馈神经网络，即 MLP）的中间维度。

- model.model.norm：最终 LayerNorm，对最后一层输出做归一化。

- lm_head：语言模型头，把归一化后的向量映射回词表大小（其权重与 embed_tokens 共享）。

### 2.2 大模型加载

#### device_map="auto" 的 from_pretrained

- 并不是把整个模型完整读进内存，而是按显存预算决定哪些权重真正进入内存；内存放不下的部分，只在内存里留一个“空壳占位”——即 meta 设备。

**from_pretrained(..., device_map="auto") 实际干了三件事：**

① 建骨架：走 low_cpu_mem_usage 路径，先建出完整的模型结构，但所有参数都是 meta 占位（只有 shape / dtype，没有数据）。

② 排布计划：accelerate 用 infer_auto_device_map 根据各设备空闲内存，贪婪地把每一层分配到 GPU / CPU / 磁盘。

③ 流式灌权重：从 safetensors 分片里读权重，灌进第②步分配好的槽位。分到 GPU / CPU 的层→灌真数据；分到 meta 的层→什么都不灌。

- 所以“加载完成”≠“所有权重都在内存里”：分到 meta 的那几层，权重数据还躺在磁盘的 .safetensors 分片里，内存里只有一个空壳。

- 执行到对应层时才从磁盘取权重，前向完成后丢回去，避免显存爆炸。

- load_state_dict 会强制把参数加载到 model 所在的设备上。

### 2.3 常用技巧

#### qkv 融合

- 将 q、k、v 三组权重在 dim0（输出特征维）上拼接，一次 GEMM 得到 Q、K、V，减少 kernel 启动与显存往返。

#### detach()

```python
result.ln_f = model.model.norm.weight.detach()
```

- 作用是切断梯度、与计算图剥离，同时零拷贝地共享底层数据。

#### hook 钩子

```python
mod.register_forward_hook(make_hook(acc, use_out=False))
```

- mod 为选中的层，register_forward_hook 注册前向钩子，make_hook 为前向完成后触发的回调函数。

#### yield 生成器函数

```python
for i in range(0, len(ids), batch_size):
    yield ids[i:i + batch_size]
```

- 它不会一次性把所有数据加载进内存，而是按需产出。例如有 512 条数据、batch_size=1，它会分 512 次、每次吐出一个 [1, 512] 的张量。

- 相比 return，它能实现“生成一条、使用后丢弃一条”，从而节省显存。

- 带 yield 的函数并不会立即执行，而是在后续被遍历时才真正执行（惰性求值）：

```python
loader = make_calib_dataloader(tokenizer, n=512)
for batch in loader:   # <--- 从这一行才开始真正执行
```

## 三、TensorRT 相关

### 3.1 构建流程

#### 3.1.1 ONNX Parser

ONNX Parser 负责把 ONNX 模型中的算子逐节点转换为 TensorRT 算子并添加进网络:

- 自定义(插件)算子:先用 importPluginCreator 按算子名(name)、版本(version)、命名空间(namespace)找到对应的 IPluginCreator;

- 插件常量数据通过 PluginField 传递,每项含 name / data / type / length 四要素。loadFields 只能自动读取 ONNX 节点的 attributes(标量属性),读不到 initializer(权重/偏置等常量张量);initializer 需手动构造 PluginField,填入 name / data / type / length 后追加到已有 field;

- 拿到 creator 与 field 后调用 createPlugin 创建插件实例,完成「ONNX 算子 → TRT 插件层」;

- 最后 addPluginV3 把插件层加入网络,输入为激活 tensor(常量已走 field 传入)。

### 3.2 模型量化

#### 3.2.1 获取各层 tensor 数据范围(校准)

- TRT 校准(如 MinMax)会前向跑若干张校准图,统计每个 Float 数据 tensor 的数值范围,但只把范围压缩成 scale(= amax/127)写进 .cache,不保存 min/max;

- 若确实需要每层的 min/max,只能把每层输出都标记为网络输出(mark_output)、构建 FP32 全输出 engine,再跑校准图自行统计;

- 注意:校准发生在构建最早期,拿到的 scale 是图优化前每个 tensor 的,而非图优化后的。

#### 3.2.2 TensorRT 量化的方法(显式 QDQ)

- TRT 的量化本质上也是图优化:构建时把 Q/DQ 算子与相邻算子(Conv/MatMul 等)融合,替换为定点(INT8)计算的 kernel;

- 因此显式量化时需在待量化算子的输入/输出两侧插入 Q(QuantizeLinear)/DQ(DequantizeLinear),构成「FP32 → Q → INT8 → DQ → FP32」边界,TRT 才能识别并做 INT8 融合;

- 权重侧:DQ(int8 权重, per-channel scale, axis) → Conv 会被融合为 INT8 权重卷积;ONNX 图上 Conv 的权重输入仍是 FP32(来自 DQ 输出),int8 只存在于独立的 initializer。

### 3.3 图优化

#### 3.3.1 TRT 图优化的特点

- TRT 的图优化完全闭源,只能通过 builder_optimization_level 设置优化等级(0–5,默认 3,0 表示几乎不优化)来控制;

- 想加入自己的图优化,只能在交给 TRT 之前的 ONNX 图上做图变换;或在解析时针对单个算子拆分(一个算子拆成多层 engine layer)。由于 importer 逐节点处理、不能跨层,多个算子的算子融合无法在解析层完成,只能靠 TRT 闭源 fusion。

#### 3.3.2 TRT 自带的典型图优化

- **1. 算子融合(Layer Fusion):**把相邻多个算子融合成单个 kernel,如 Conv + Bias + ReLU → CBR 融合、LayerNorm 相关融合等,减少 kernel 启动次数与显存往返;

- **2. 常量折叠(Constant Folding):**把只依赖常量、没有运行时输入的算子子图(常见于 shape / 索引计算)在构建期直接算出结果,运行期省掉这些计算;

- **3. Q/DQ 融合与吸收:**背靠背的 DQ→Q 直接抵消(消除中间 FP32 往返),DQ(权重)→Conv/MatMul 融合为 INT8 权重 kernel,Q/DQ 被吸收进相邻 kernel 的前/后处理(prologue / epilogue)。

### 3.4 build(构建)

- build 阶段本身包含图优化,kernel 融合、布局变换、Q/DQ 吸收都在此完成;

- 构建时 TRT 会对每个算子在可选 kernel 实现上多轮运行计时,自动选出性能最好的那一组(autotuning),因此构建耗时远大于单次推理。

### 3.5 TensorRT 的优势

- 深度适配 NVIDIA GPU:算子针对具体 SM 架构优化;

- 内置 kernel 自动调优:自动挑选最快实现;

- Tensor Core 数据布局:权重预变换、K 维对齐,最大化利用 FP16 / INT8 / FP8 加速单元;

- 显存规划:中间张量内存池化复用,降低分配开销。

## 四、TensorRT-LLM 相关

### 4.1 构建流程

#### define-by-run

- TRT-LLM 的模型创建采用类似 ONNX 的“运行自动记录”方式：构建时真正执行一次前向，把每个算子登记进网络（network），从而得到计算图。

```python
network.set_named_parameters(model.named_parameters())   # 把模型所有参数的引用登记进网络
model.prepare_inputs(**prepare_input_args)               # 根据 build 参数自动生成占位输入
model(**inputs)                                          # 执行一次前向，把算子记录进 network
```

- 构图完成后调用 optimize(network) 做图优化，最后由 builder.build_engine() 生成 engine 文件。

### 4.2 Profiling

- 性能分析等级（profiling_verbosity）：NONE / LAYER_NAMES_ONLY / DETAILED，三者内容从无到多。

- LAYER_NAMES_ONLY 只记录层名，能看出每层在时间轴上的占比。默认值为 layer_names_only。

### 4.3 model.config（PretrainedConfig）优化相关字段

以下字段属于模型配置（model.config），在构建时作为优化 / 量化依据：

| 字段 | 类型 / 默认 | 作用 |
| --- | --- | --- |
| use_parallel_embedding | bool, False | 将 embedding 表按词表维度切分到多卡（模型并行），嵌入层过大一张卡放不下时开启 |
| embedding_sharding_dim | int, 0 | embedding 表的切分维度（0 = 按词表维切分） |
| quantization.quant_algo | enum | 权重量化算法：FP8、NVFP4、W4A16、W8A16、W4A8_AWQ、SmoothQuant、MIXED_PRECISION 等 |
| quantization.kv_cache_quant_algo | enum | KV cache 量化算法（如 FP8 / INT8），决定是否使用量化 KV cache |
| quantization.exclude_modules | list | 不做量化的模块（如 lm_head） |
| quantization.quantized_layers | list | MIXED_PRECISION 时逐层指定量化方式 |
| dtype | str, float16 | 模型基础精度，同时被写入 plugin_config.dtype |
| max_position_embeddings | int | 位置编码最大长度，用于推导 max_seq_len |
| position_embedding_type | enum | 位置编码类型（learned_absolute / rope 等），影响长度限制校验 |


### 4.4 optimize_model 图优化 passes（全部 15 个参数）

optimize_model() 定义在 tensorrt_llm/models/modeling_utils.py，构建时由 optimize_model_with_config()（builder.py）传入参数并按顺序执行。

| 参数 | 触发的 pass | 说明 | 默认值 / 来源 |
| --- | --- | --- | --- |
| use_parallel_embedding | parallelize_embedding | 把 embedding 表按词表维切分到多卡（需先于权重复制执行） | model.config.use_parallel_embedding，构建时 False |
| share_embedding_table | share_embedding | 让 lm_head.weight 与 vocab_embedding.weight 指向同一份权重，转换后只存一份 embedding 表 | 构建时固定 True |
| use_ootb_moe | to_ootb_moe | Out-of-the-box MoE：不用 MoE 专用 plugin，改用 TRT 原生算子实现 MoE 层 | = plugin_config.moe_plugin 为 None |
| use_fused_mlp | fuse_gate_mlp | Gated-MLP 水平融合：把 gate 与 up 两次 Matmul 合并为一次（两权重拼接，一次 GEMM 得到 U/G 拼接输出），再用单独 SwiGLU kernel | = plugin_config.use_fused_mlp 且非 encoder-decoder 且非 (RecurrentGemma + FP8) |
| gemm_swiglu_plugin_dtype | （配合 fuse_gate_mlp） | GEMM + SwiGLU 融合进单个 kernel（结合 cuBLASLt），目前仅支持 fp8（Hopper SM≥90） | = plugin_config.gemm_swiglu_plugin；开启需 use_fused_mlp |
| low_latency_gemm_swiglu_plugin_dtype | （配合 fuse_gate_mlp） | 面向低延迟场景的 GEMM + SwiGLU 融合 plugin，仅 fp8，仅在低 batch 下有效 | = plugin_config.low_latency_gemm_swiglu_plugin |
| use_fused_rg_lru | fuse_rg_lru | 融合 RG-LRU（Real-Gated Linear Recurrent Unit，真实门控线性循环单元）的线性层 | 仅 RecurrentGemma 架构自动开启 |
| use_unfused_qkv_gemm | unfuse_qkv_gemm | 把融合的 QKV GEMM 拆开（调试 / 特殊场景用） | 构建时固定 False |
| use_prompt_tuning | set_prompt_tuning | 启用 Prompt Tuning（soft prompt 表） | = build_config.max_prompt_embedding_table_size > 0 |
| use_lora | add_lora | 冻结原权重，在指定层插入低秩矩阵 A×B（秩远小于原权重）；训练只微调 A、B，推理时把 A×B 合并回原权重 | = plugin_config.lora_plugin 非空 |
| max_lora_rank | （配合 add_lora） | LoRA 最大秩上限 | = lora_config.max_lora_rank |
| use_fp8_context_fmha | set_fp8_context_fhma | Prefill 阶段处理长 prompt 时用 FP8 精度计算注意力核心，显著降低显存并加速 | = FP8/W4A8_AWQ/NVFP4 量化 且 plugin_config.use_fp8_context_fmha；需 Ada/Hopper（SM≥89） |
| fuse_fp4_quant | set_fuse_fp4_quant | 把 FP4 量化融合进 Attention kernel | = plugin_config.fuse_fp4_quant |
| use_optimize_cross_qkv | optimize_cross_qkv | 交叉注意力中 decoder 与 encoder 都算完整 QKV 是冗余的：实际只需 decoder 的 Q 与 encoder 的 KV，该 pass 消除冗余 GEMM | 构建时固定 True；与 LoRA 不兼容（use_lora 时跳过） |
| use_dora | （配合 add_lora） | 在 LoRA 基础上启用 DoRA（Weight-Decomposed Low-Rank Adaptation） | = plugin_config.dora_plugin |


**相关补充说明：**

- use_fused_mlp 的效果：原实现要来回从 HBM（显存）读 3、4 次数据；融合后只需一次读、一次写，配合高性能自定义 CUDA 算子实现。

- use_diff_of_squares：注意它并不是 optimize_model 的独立参数，而是 LayerNorm 插件计算方差时的数值技巧——用恒等式 Var = E[X²] − E[X]²，可把“先求均值再求方差”的两遍遍历合并为一遍。但当 x 很大时，E[X²] 与 E[X]² 两个大数相减会产生灾难性抵消（catastrophic cancellation），fp16 下精度丢失严重，因此做成开关。

- GemmSwiGLU / 低延迟 SwiGLU 插件都要求先开启 use_fused_mlp，否则构建直接报错（builder.py 中显式校验）。

### 4.5 plugin_config（PluginConfig）全部选项

PluginConfig 定义在 tensorrt_llm/plugin/plugin.py，是 build_config.plugin_config 的类型。取值约定：

- 插件类选项（xxx_plugin）：赋“auto”表示用 dtype 字段的精度启用；赋 float16 / bfloat16 / float32 / int32 表示以该精度启用；赋 None（或字符串“disable”）表示禁用。

- 特性类选项：True / False（或字符串“enable”/“disable”）表示开关。

#### 插件类（Plugins）

| 字段 | 取值 | 作用 |
| --- | --- | --- |
| dtype | float16 等 | 插件 / 模型的基础精度，构建时自动取 model.config.dtype |
| bert_attention_plugin | auto / None | BERT 类 encoder 的融合 Attention kernel，可原位更新 KV cache |
| gpt_attention_plugin | auto / None | GPT 类 decoder 的融合 Attention kernel，可原位更新 KV cache |
| gemm_plugin | auto/fp8/nvfp4/None | 基于 cuBLASLt 的 GEMM plugin（对非量化 GEMM 生效；FP8 也要求 checkpoint 已校准） |
| gemm_swiglu_plugin | fp8 / None | GEMM + SwiGLU 融合 kernel（Hopper 上仅支持 fp8） |
| fp8_rowwise_gemm_plugin | auto / None | FP8 量化 GEMM：激活 per-token 动态 scale + 权重 per-channel 静态 scale |
| qserve_gemm_plugin | auto / None | QServe 量化 GEMM（W4A8：权重 4bit + 激活 8bit） |
| identity_plugin | auto / None | 输入到输出的恒等拷贝，主要用于调试 |
| nccl_plugin | auto / None | 封装 NCCL 算子，支持多卡 / 多节点通信 |
| lora_plugin | auto / None | 启用 LoRA |
| dora_plugin | bool, False | 启用 DoRA |
| weight_only_groupwise_quant_matmul_plugin | auto / None | 分组 weight-only 量化 Matmul |
| weight_only_quant_matmul_plugin | auto / None | weight-only 量化 Matmul |
| smooth_quant_plugins | bool, True | SmoothQuant 系列插件总开关（会同时设置以下相关插件） |
| smooth_quant_gemm_plugin | auto / None | SmoothQuant 的 GEMM kernel |
| layernorm_quantization_plugin | auto / None | LayerNorm + 量化融合 kernel |
| rmsnorm_quantization_plugin | auto / None | RMSNorm + 量化融合 kernel |
| quantize_per_token_plugin | bool, False | per-token 量化 kernel |
| quantize_tensor_plugin | bool, False | per-tensor 量化 kernel |
| moe_plugin | auto / None | MoE 层专用加速 kernel（为 None 时触发 use_ootb_moe） |
| mamba_conv1d_plugin | auto / None | Mamba 模型 conv1d 算子的加速 kernel |
| low_latency_gemm_plugin | fp8 / None | 面向低延迟场景优化的 GEMM plugin |
| low_latency_gemm_swiglu_plugin | fp8 / None | 低延迟 GEMM + SwiGLU 融合（仅低 batch 有效） |
| gemm_allreduce_plugin | fp16/bf16/None | GEMM + AllReduce 融合 kernel |


#### 特性类（Features）

| 字段 | 类型 / 默认 | 作用 |
| --- | --- | --- |
| context_fmha | bool, True | Prefill（context）阶段用融合 MHA / MQA / GQA 的单一 kernel |
| bert_context_fmha_fp32_acc | bool, False | BERT context FMHA 用 FP32 累加（精度更好但更慢） |
| paged_kv_cache | bool, None | 分页 KV cache，更高效地管理显存，通常可提高 batch 与效率 |
| remove_input_padding | bool, True | 把不同长度的 token 打包到一起，减少计算量与显存 |
| norm_quant_fusion | bool, False | 把 LayerNorm 与量化融合为单个 kernel |
| reduce_fusion | bool, False | 把 AllReduce 之后的 ResidualAdd + LayerNorm 融合为单个 kernel |
| user_buffer | bool, False | 省去通信 kernel 中本地 buffer 到共享 buffer 的拷贝；必须与 reduce_fusion 一起开启（当前主要支持 FP8 Llama） |
| tokens_per_block | int, 32 | 每个分页 KV cache block 包含多少个 token |
| use_paged_context_fmha | bool, True | 启用分页 context FMHA，支持 KV cache 复用与 chunked context |
| use_fp8_context_fmha | bool, True | FP8 量化时进一步用 FP8 Context FMHA 加速（需 Ada / Hopper） |
| fuse_fp4_quant | bool, False | 把 FP4 量化融合进 Attention kernel |
| multiple_profiles | bool, False | 生成多个 TRT optimization profile，GEMM plugin 关闭时更易选到好 kernel；代价是构建时间变长 |
| paged_state | bool, True | 为 RNN state 分页管理显存 |
| streamingllm | bool, False | StreamingLLM：窗口注意力，在长文本上高效且稳定 |
| manage_weights | bool, False | 启用 TRT-LLM 托管权重（配合 use_strip_plan），加速引擎构建 |
| use_fused_mlp | bool, True | Gated-MLP 水平融合（gate+up 一次 Matmul） |
| pp_reduce_scatter | bool, False | 面向大 MoE 的管道并行优化：ReduceScatter + AllGather |


### 4.6 BuildConfig 全部字段

BuildConfig 定义在 tensorrt_llm/builder.py，是引擎构建参数的总入口。

| 字段 | 类型 / 默认 | 作用 |
| --- | --- | --- |
| max_input_len | int, 1024 | 输入序列的最大长度 |
| max_seq_len | int, None | 单个请求的最大序列长度（输入 + 输出）；None 时由 max_position_embeddings × rotary_factor 推导 |
| opt_batch_size | int, 8 | 引擎优化所针对的最优 batch 大小 |
| max_batch_size | int, 2048 | 引擎能处理的最大 batch |
| max_beam_width | int, 1 | beam search 解码的最大束宽 |
| max_num_tokens | int, 8192 | 去 padding 后每批最大 token 数（chunked prefill / 投机解码的容量依据） |
| opt_num_tokens | int, None | 引擎优化所针对的最优 token 数 |
| max_prompt_embedding_table_size | int, 0 | Prompt Tuning 最大 embedding 表；>0 时触发 use_prompt_tuning |
| kv_cache_type | enum, None | KV cache 类型（CONTINUOUS / PAGED），默认 PAGED；与 plugin_config.paged_kv_cache 保持一致 |
| gather_context_logits | bool, False | 是否收集 Prefill 阶段的 logits |
| gather_generation_logits | bool, False | 是否收集生成阶段的 logits |
| strongly_typed | bool, True | TRT 强类型网络；FP8 等量化时会被强制开启 |
| force_num_profiles | int, None | 强制指定 optimization profile 数量（None 为自动） |
| profiling_verbosity | str, layer_names_only | TRT profiling 等级：none / layer_names_only / detailed |
| enable_debug_output | bool, False | 构建时输出调试张量（标记 network 输出） |
| max_draft_len | int, 0 | 投机解码（speculative decoding）的 draft token 最大长度 |
| speculative_decoding_mode | enum, NONE | 投机解码模式：NONE / MEDUSA / EAGLE / LOOKAHEAD_DECODING 等 |
| use_refit | bool, False | 启用引擎 refit（多卡构建可先建 1 卡再 refit 其余） |
| input_timing_cache | str, None | 输入 timing cache 文件路径 |
| output_timing_cache | str, model.cache | 输出 timing cache 文件路径 |
| lora_config | LoraConfig | LoRA 配置（lora_dir、max_lora_rank、target_modules 等） |
| weight_sparsity | bool, False | 启用权重稀疏（TRT SPARSE_WEIGHTS）优化 |
| weight_streaming | bool, False | 大模型权重流式加载（TRT WEIGHT_STREAMING） |
| plugin_config | PluginConfig | 插件配置，见 4.5 |
| use_strip_plan | bool, False | 构建剥离权重的引擎（对应 TRT STRIP_PLAN + REFIT_INDIVIDUAL），适配“先剥离后注入”的部署方式 |
| max_encoder_input_len | int, 1024 | encoder-decoder 模型 encoder 输入最大长度 |
| dry_run | bool, False | 只构图、不真正 build 引擎 |
| visualize_network | str, None | 导出网络可视化 ONNX 的路径 |
| monitor_memory | bool, False | 监控构建期的显存 / 内存使用 |
| use_mrope | bool, False | 多模态旋转位置编码（mRoPE） |


### 4.7 build() 构建时的自动联动逻辑

以下逻辑在 builder.py 的 build() 中自动执行，理解它们有助于判断各优化能否同时生效：

- kv_cache_type 与 plugin_config.paged_kv_cache / paged_state 三者保持一致（update_kv_cache_type）。

- max_seq_len 推导：None 时取 max_position_embeddings × rotary_factor；超过时给出告警。

- max_num_tokens / opt_num_tokens 由 check_max_num_tokens 校验并可能修正。

- streamingllm 开启时会强制关闭 use_paged_context_fmha。

- reduce_fusion 仅在 TP=1 或 Llama / Gemma2 / Medusa 架构下生效，否则被覆盖为 False。

- user_buffer 依赖 reduce_fusion；norm_quant_fusion 受 reduce_fusion / 架构 / 量化类型限制。

- FP8 量化（含 FP8 KV cache）时强制 strongly_typed=True。

- 投机解码：max_seq_len 会 += max_draft_len（EAGLE 时 += num_eagle_layers）；max_num_tokens 不小于 max_batch_size × (max_draft_len + 1)。

- context_fmha 关闭 → fp8 / paged context fmha 一并关闭；fp8 context fmha 仅在 FP8 / W4A8_AWQ / NVFP4 量化下且 SM≥89（Ada / Hopper）生效，否则自动关闭。

- NVFP4 量化检测到且未显式禁用 gemm_plugin 时，默认把 gemm_plugin 设为 nvfp4。

- use_strip_plan=True 时设置 TRT STRIP_PLAN 与 REFIT_INDIVIDUAL 标志；use_refit=True 时设置 REFIT 标志。

- profiling_verbosity 字符串映射为 TRT 枚举：none / layer_names_only / detailed。

- 多卡（world_size > 1）时自动设置 nccl_plugin = 模型 dtype。
