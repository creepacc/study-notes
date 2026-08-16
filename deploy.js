/* 部署脚本:通过 GitHub git data API 把本地 study-notes 同步到仓库 main 分支。
 * 依赖: node >= 18(内置 fetch) + gh CLI 已登录。
 * 运行: node deploy.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const OWNER = 'creepacc';
const REPO = 'study-notes';
const BRANCH = 'main';
const ROOT = __dirname;
const API = 'https://api.github.com';
const token = execSync('gh auth token').toString().trim();

/* 本地文件列表(相对路径),排除 .git 与 deploy.js 本身 */
function localFiles() {
  const out = [];
  function walk(dir, rel) {
    for (const name of fs.readdirSync(dir)) {
      if (name === '.git') continue;
      const full = path.join(dir, name);
      const r = rel ? rel + '/' + name : name;
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full, r);
      else out.push(r);
    }
  }
  walk(ROOT, '');
  return out;
}

async function gh(apiPath, method, body) {
  const res = await fetch(API + apiPath, {
    method: method || 'GET',
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github+json',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 204) return null;
  const j = await res.json();
  if (!res.ok) throw new Error(method + ' ' + apiPath + ' -> ' + res.status + ' ' + JSON.stringify(j).slice(0, 300));
  return j;
}

(async () => {
  const files = localFiles();
  console.log('本地文件 ' + files.length + ' 个:');
  files.forEach(f => console.log('  ' + f));

  // 当前 main 分支
  const ref = await gh('/repos/' + OWNER + '/' + REPO + '/git/ref/heads/' + BRANCH);
  const baseCommit = await gh('/repos/' + OWNER + '/' + REPO + '/git/commits/' + ref.object.sha);
  const baseTreeSha = baseCommit.tree.sha;
  console.log('当前 main -> ' + ref.object.sha.slice(0, 7) + ', base_tree=' + baseTreeSha.slice(0, 7));

  // 建立 blob
  const tree = [];
  for (const f of files) {
    const content = fs.readFileSync(path.join(ROOT, f)).toString('base64');
    const b = await gh('/repos/' + OWNER + '/' + REPO + '/git/blobs', 'POST', { content: content, encoding: 'base64' });
    tree.push({ path: f, mode: '100644', type: 'blob', sha: b.sha });
    console.log('  blob: ' + f);
  }

  // 删除旧文件(被新结构取代)
  const obsolete = ['学习笔记/apply.json'];
  for (const f of obsolete) {
    tree.push({ path: f, mode: '100644', type: 'blob', sha: null });
    console.log('  remove: ' + f);
  }

  // 新 tree
  const newTree = await gh('/repos/' + OWNER + '/' + REPO + '/git/trees', 'POST', {
    base_tree: baseTreeSha,
    tree: tree
  });
  console.log('new tree: ' + newTree.sha.slice(0, 7));

  // 提交
  const commit = await gh('/repos/' + OWNER + '/' + REPO + '/git/commits', 'POST', {
    message: 'rebuild: 求职之路 个人站(求职记录/学习笔记/简历/面试经验)',
    tree: newTree.sha,
    parents: [ref.object.sha]
  });
  console.log('commit: ' + commit.sha.slice(0, 7));

  // 更新分支
  await gh('/repos/' + OWNER + '/' + REPO + '/git/refs/heads/' + BRANCH, 'PATCH', {
    sha: commit.sha,
    force: false
  });
  console.log('部署完成: main 已更新到 ' + commit.sha.slice(0, 7));
})().catch(e => { console.error('部署失败:', e.message); process.exit(1); });
