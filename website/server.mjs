import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const files=new Map([['/','index.html'],['/site.css','site.css'],['/site.mjs','site.mjs'],['/mark.svg','mark.svg'],['/downloads/HyperAccts-Setup-0.1.0.exe','downloads/HyperAccts-Setup-0.1.0.exe']]);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.exe':'application/octet-stream'};
http.createServer(async(req,res)=>{const file=files.get(new URL(req.url,'http://localhost').pathname);if(!file||!['GET','HEAD'].includes(req.method)){res.writeHead(404);return res.end('Not found');}try{const data=await readFile(path.join(root,file));res.writeHead(200,{'content-type':types[path.extname(file)],'x-content-type-options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end('Download not available in this local preview yet.');}}).listen(4180,'127.0.0.1',()=>console.log('Website preview: http://127.0.0.1:4180'));
