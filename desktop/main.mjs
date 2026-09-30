import {app,BrowserWindow,shell,dialog} from 'electron';
import {startServer} from '../server.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
let server,window;
const origin='http://127.0.0.1:4174';
const externalHosts=new Set(['hyperaccts.com','www.hyperaccts.com','checkout.stripe.com','connect.stripe.com']);
function external(url){try{const u=new URL(url);if(u.protocol==='https:'&&externalHosts.has(u.hostname))void shell.openExternal(u.href);}catch{}}
if(!app.requestSingleInstanceLock())app.quit();
else {
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
  app.whenReady().then(async()=>{
    try{server=await startServer(4174,{directory:path.join(app.getPath('userData'),'workspace')});}catch{dialog.showErrorBox('HyperAccts could not start','The workspace could not open. Check whether port 4174 is in use and whether the app can write to its data folder.');app.quit();return;}
    window=new BrowserWindow({width:1420,height:960,minWidth:980,minHeight:680,title:'HyperAccts',icon:path.join(here,'icon.ico'),backgroundColor:'#f5f7f5',autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
    window.webContents.setWindowOpenHandler(({url})=>{external(url);return {action:'deny'};});
    window.webContents.on('will-navigate',(e,url)=>{if(new URL(url).origin!==origin){e.preventDefault();external(url);}});
    window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    await window.loadURL(origin);
  });
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>server?.close());
}
