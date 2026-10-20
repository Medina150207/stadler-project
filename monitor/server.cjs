/* Optional static server. No packages, build step or remote services are required. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=__dirname,port=Number(process.env.PORT||8765);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.ttf':'font/ttf','.csv':'text/csv; charset=utf-8','.md':'text/plain; charset=utf-8','.png':'image/png','.json':'application/json'};
http.createServer((req,res)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);res.end('Bad request');return;}
  const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(target!==root&&!target.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
  fs.stat(target,(err,stat)=>{if(err||!stat.isFile()){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});fs.createReadStream(target).pipe(res);});
}).listen(port,'127.0.0.1',()=>console.log(`NO SHUTDOWN is ready at http://127.0.0.1:${port}`));
