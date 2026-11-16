// Immutable physical storage for the existing JSON decision evidence encoding.
// Logical object digests always cover the original UTF-8 bytes, never the manifest.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

const MiB=1024*1024;
export const VALUE_EVIDENCE_CHUNK_BYTES=16*MiB;
export const VALUE_EVIDENCE_INLINE_BYTES=64*MiB;
const LEGACY_READ_MAX=128*MiB;
const LOGICAL_MAX=384*MiB;
const MANIFEST_MAX=64*1024;
const SCHEMA='ai-matchlab.value-evidence-chunk-manifest.v1';
const STORAGE='chunked-json-v1';
const base='data/value/_execution-evidence';
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const sha=b=>createHash('sha256').update(b).digest('hex');
const inlinePath=h=>`${base}/objects/${h.slice(0,2)}/${h}.json`;
const manifestPath=h=>`${base}/chunked/${h.slice(0,2)}/${h}.json`;
// JSON string containing canonical base64: the existing history archive includes
// .json files, and a 16 MiB raw chunk stays below 23 MiB even after base64.
const chunkPath=h=>`${base}/chunks/${h.slice(0,2)}/${h}.json`;
const chunkEncodedBytes=n=>4*Math.ceil(n/3)+3;
const safeBytes=(n,max)=>Number.isSafeInteger(n)&&n>0&&n<=max;
const json=b=>JSON.parse(b.toString('utf8'));
function readFile(root,relative,size,hash){
 const file=path.resolve(root,relative);
 if(fs.realpathSync(file)!==file||!fs.lstatSync(file).isFile())throw Error('boundary_object_path_escape');
 if(fs.statSync(file).size!==size)throw Error('boundary_object_bytes_mismatch');
 const raw=fs.readFileSync(file);
 if(raw.length!==size||sha(raw)!==hash)throw Error('boundary_object_bytes_mismatch');
 return raw;
}
// The writer receives the data root, matching the existing data-root contract.
function writeImmutable(dataRoot,relative,bytes,hash){
 const file=path.join(dataRoot,...relative.slice(5).split('/'));
 fs.mkdirSync(path.dirname(file),{recursive:true});
 if(fs.realpathSync(path.dirname(file))!==path.dirname(file))throw Error('value_evidence_path_escape');
 const existing=()=>{
  if(fs.realpathSync(file)!==file||!fs.lstatSync(file).isFile()||fs.statSync(file).size!==bytes.length||sha(fs.readFileSync(file))!==hash)throw Error('immutable_value_input_evidence_conflict');
 };
 if(fs.existsSync(file)){existing();return;}
 const temp=`${file}.tmp-${randomUUID()}`;
 let fd;
 try{
  fd=fs.openSync(temp,'wx');fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
  // Publish without replacing a concurrently created content-addressed object.
  try{fs.linkSync(temp,file);}catch(e){if(e.code!=='EEXIST')throw e;existing();}
  if(process.platform!=='win32'){const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
 }finally{if(fd!==undefined)fs.closeSync(fd);if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
export function storeEncodedValueEvidence(dataRoot,bytes,{allowChunking=true}={}){
 if(!Buffer.isBuffer(bytes)||!safeBytes(bytes.length,LOGICAL_MAX))throw Error('value_evidence_logical_size_limit');
 fs.mkdirSync(dataRoot,{recursive:true});dataRoot=fs.realpathSync(dataRoot);
 const hash=sha(bytes),size=bytes.length;
 if(size<=VALUE_EVIDENCE_INLINE_BYTES){const relative=inlinePath(hash);writeImmutable(dataRoot,relative,bytes,hash);return {path:relative,sha256:hash,bytes:size};}
 if(!allowChunking)throw Error('value_evidence_receipt_size_limit');
 const chunks=[];
 for(let offset=0;offset<size;offset+=VALUE_EVIDENCE_CHUNK_BYTES){
  const raw=bytes.subarray(offset,Math.min(size,offset+VALUE_EVIDENCE_CHUNK_BYTES));
  const encoded=Buffer.from(JSON.stringify(raw.toString('base64'))+'\n','utf8'),encodedHash=sha(encoded),relative=chunkPath(encodedHash);
  writeImmutable(dataRoot,relative,encoded,encodedHash);
  chunks.push({path:relative,sha256:encodedHash,bytes:encoded.length,rawSha256:sha(raw),rawBytes:raw.length});
 }
 const manifest=Buffer.from(JSON.stringify({schema:SCHEMA,sha256:hash,bytes:size,chunkBytes:VALUE_EVIDENCE_CHUNK_BYTES,chunks},null,2)+'\n','utf8');
 const relative=manifestPath(hash),manifestSha256=sha(manifest);
 writeImmutable(dataRoot,relative,manifest,manifestSha256);
 return {path:relative,sha256:hash,bytes:size,storage:STORAGE,manifestSha256,manifestBytes:manifest.length};
}
export function readEncodedValueEvidence(root,ref){
 if(!ref||!hex(ref.sha256))throw Error('invalid_boundary_object_ref');
 if(ref.storage===undefined){
  if(ref.path!==inlinePath(ref.sha256)||!safeBytes(ref.bytes,LEGACY_READ_MAX)||ref.manifestSha256!==undefined||ref.manifestBytes!==undefined)throw Error('invalid_boundary_object_ref');
  return readFile(root,ref.path,ref.bytes,ref.sha256);
 }
 if(ref.storage!==STORAGE||ref.path!==manifestPath(ref.sha256)||!safeBytes(ref.bytes,LOGICAL_MAX)||ref.bytes<=VALUE_EVIDENCE_INLINE_BYTES||!hex(ref.manifestSha256)||!safeBytes(ref.manifestBytes,MANIFEST_MAX))throw Error('invalid_boundary_object_ref');
 const manifest=json(readFile(root,ref.path,ref.manifestBytes,ref.manifestSha256));
 if(manifest?.schema!==SCHEMA||manifest.sha256!==ref.sha256||manifest.bytes!==ref.bytes||manifest.chunkBytes!==VALUE_EVIDENCE_CHUNK_BYTES||!Array.isArray(manifest.chunks)||manifest.chunks.length!==Math.ceil(ref.bytes/VALUE_EVIDENCE_CHUNK_BYTES))throw Error('invalid_boundary_chunk_manifest');
 const bytes=Buffer.allocUnsafe(ref.bytes),total=createHash('sha256');let offset=0;
 for(const chunk of manifest.chunks){
  const expected=Math.min(VALUE_EVIDENCE_CHUNK_BYTES,ref.bytes-offset);
  if(!chunk||!hex(chunk.sha256)||!hex(chunk.rawSha256)||chunk.path!==chunkPath(chunk.sha256)||chunk.rawBytes!==expected||chunk.bytes!==chunkEncodedBytes(expected))throw Error('invalid_boundary_chunk_ref');
  const encoded=readFile(root,chunk.path,chunk.bytes,chunk.sha256),text=json(encoded);
  if(typeof text!=='string'||text.length!==chunk.bytes-3)throw Error('invalid_boundary_chunk_encoding');
  const raw=Buffer.from(text,'base64');
  if(raw.length!==expected||raw.toString('base64')!==text||sha(raw)!==chunk.rawSha256)throw Error('boundary_chunk_bytes_mismatch');
  total.update(raw);raw.copy(bytes,offset);offset+=raw.length;
 }
 if(offset!==ref.bytes||total.digest('hex')!==ref.sha256)throw Error('boundary_object_bytes_mismatch');
 return bytes;
}
