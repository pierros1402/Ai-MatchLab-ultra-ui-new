import http from 'node:http';
import {spawn} from 'node:child_process';
const server=http.createServer((req,res)=>{
  if(req.headers.authorization!=='Basic dGVzdDp0ZXN0'){res.writeHead(401,{'www-authenticate':'Basic realm="fixture"'});res.end();return;}
  const url=new URL(req.url,'http://localhost');
  const child=spawn('git',['http-backend'],{env:{...process.env,GIT_PROJECT_ROOT:process.argv[2],GIT_HTTP_EXPORT_ALL:'1',
    PATH_INFO:url.pathname,QUERY_STRING:url.search.slice(1),REQUEST_METHOD:req.method,CONTENT_TYPE:req.headers['content-type']||'',
    CONTENT_LENGTH:req.headers['content-length']||'',REMOTE_USER:'test',HTTP_GIT_PROTOCOL:req.headers['git-protocol']||''},windowsHide:true});
  const output=[];child.stdout.on('data',b=>output.push(b));child.stderr.resume();req.pipe(child.stdin);
  child.on('close',()=>{
    const bytes=Buffer.concat(output);let end=bytes.indexOf('\r\n\r\n'),delimiter=4;
    if(end<0){end=bytes.indexOf('\n\n');delimiter=2;}
    if(end<0){res.writeHead(500);res.end('backend_failed');return;}
    const headers={};let status=200;
    for(const line of bytes.subarray(0,end).toString().split(/\r?\n/)){const at=line.indexOf(':');if(at<0)continue;const key=line.slice(0,at),value=line.slice(at+1).trim();if(key.toLowerCase()==='status')status=Number(value.split(' ')[0]);else headers[key]=value;}
    res.writeHead(status,headers);res.end(bytes.subarray(end+delimiter));
  });
});
server.listen(0,'127.0.0.1',()=>process.stdout.write(String(server.address().port)+'\n'));
