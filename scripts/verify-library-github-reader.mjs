import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const requests=[];
let replies=[];
const context=vm.createContext({window:{},TextEncoder,TextDecoder,atob,btoa,fetch:async(url,options)=>{
  requests.push({url,headers:options.headers});
  assert.ok(replies.length,'Unexpected request');
  return replies.shift();
}});
vm.runInContext(readFileSync(new URL('../public/modules/cfx-post-library/github-file-reader.js',import.meta.url),'utf8'),context);
const reader=context.window.CfxGithubFileReader;
const cfg={owner:'fixture',repo:'private-library',branch:'feature/test',path:'data/资料库.json'};
const headers={Accept:'application/vnd.github+json',Authorization:'Bearer fake-test-token'};
const sha='0123456789abcdef0123456789abcdef01234567';
const text=JSON.stringify({items:[{id:'item',title:'中文公式'}],categories:['公式'],folders:[]});
const encoded=value=>Buffer.from(value).toString('base64');
function response(value,status=200,etag='') {
  return new Response(typeof value==='string'?value:JSON.stringify(value),{status,headers:etag?{ETag:etag}:{}});
}
function setup(...values){requests.length=0;replies=values;}
setup(response({type:'file',sha,encoding:'base64',content:encoded(text)},200,'"small"'));
const small=await reader.readFile(cfg,headers);
assert.equal(reader.readDatabase(small).items[0].title,'中文公式');
assert.equal(small._etag,'"small"');
assert.equal(requests.length,1);
assert.match(requests[0].url,/data\/.*\.json\?ref=feature%2Ftest$/);

const largeText=JSON.stringify({items:[{id:'large',notes:'x'.repeat(1509981)}]});
setup(response({type:'file',sha,encoding:'none',content:'',size:Buffer.byteLength(largeText),download_url:'https://untrusted.example/file'},200,'"large"'),response(largeText));
const large=await reader.readFile(cfg,headers,{conditional:true,etag:'"old"'});
assert.equal(reader.readDatabase(large).items[0].notes.length,1509981);
assert.equal(large.sha,sha);
assert.equal(large.encoding,'base64');
assert.equal(large._etag,'"large"');
assert.equal(requests.length,2);
assert.equal(requests[1].url,`https://api.github.com/repos/fixture/private-library/git/blobs/${sha}`);
assert.equal(requests[1].headers.Authorization,headers.Authorization);
assert.equal(requests[1].headers.Accept,'application/vnd.github.raw+json');
assert.equal(requests[1].headers['If-None-Match'],undefined);
assert.equal(headers['If-None-Match'],undefined);

setup(new Response(null,{status:304}));
assert.equal((await reader.readFile(cfg,headers,{conditional:true,etag:'"old"',sha})).notModified,true);
assert.equal(requests.length,1);
setup(response({message:'Not Found'},404));
assert.equal(await reader.readFile(cfg,headers,{allowMissing:true}),null);
setup(response({message:'Not Found'},404));
await assert.rejects(()=>reader.readFile(cfg,headers),error=>error.status===404);
setup(response({message:'Forbidden'},403));
await assert.rejects(()=>reader.readFile(cfg,headers),error=>error.status===403);

for(const bad of [
  {type:'file',sha,encoding:'base64',content:'',size:0},
  {type:'file',sha,encoding:'base64',content:encoded('{"items":[')},
  {type:'file',sha,encoding:'base64',content:encoded('{"unexpected":true}')},
  {type:'dir'},
  {type:'file',encoding:'none',size:1500000,content:''},
]){
  setup(response(bad));
  await assert.rejects(()=>reader.readFile(cfg,headers));
}
setup(response(''));
await assert.rejects(()=>reader.readFile(cfg,headers),/响应为空或不完整/);
setup(response({type:'file',sha,encoding:'none',size:1500000,content:''}),response('{"items":['));
await assert.rejects(()=>reader.readFile(cfg,headers),/JSON 不完整或格式无效/);
setup(response({type:'file',sha,encoding:'none',size:1500000,content:''}),response({message:'Access denied'},403));
await assert.rejects(()=>reader.readFile(cfg,headers),error=>error.status===403);
setup(response({type:'file',sha,encoding:'base64',content:encoded('\uFEFF'+text)}));
assert.equal(reader.readDatabase(await reader.readFile(cfg,headers)).items[0].title,'中文公式');
setup(response('',200));
await assert.rejects(()=>reader.readApiJson(replies.shift(),'GitHub 上传'),/响应为空或不完整/);
console.log('PASS: inline JSON, >1 MB SHA-pinned blob fallback, Unicode/BOM, ETag/304, missing files, directory paths, HTTP failures, empty/truncated data, auth confinement and upload-response validation.');
