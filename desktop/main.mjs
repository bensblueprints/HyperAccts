import {app,BrowserWindow,shell,dialog} from 'electron';
import {startServer} from '../server.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
let server,window;
const port=Number(process.env.HYPERACCTS_DESKTOP_PORT||4174);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('HYPERACCTS_DESKTOP_PORT must be an integer from 1024 to 65535.');
if(process.env.HYPERACCTS_PROFILE_DIR)app.setPath('userData',path.resolve(process.env.HYPERACCTS_PROFILE_DIR));
const origin=`http://127.0.0.1:${port}`;
const externalHosts=new Set(['hyperaccts.com','www.hyperaccts.com','docs.smspva.com','daisysms.io','2captcha.com','5sim.net','anti-captcha.com','yescaptcha.com','developers.nopecha.com']);
function external(url){try{const u=new URL(url);if(u.protocol==='https:'&&externalHosts.has(u.hostname))void shell.openExternal(u.href);}catch{}}
if(!app.requestSingleInstanceLock())app.quit();
else {
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
  app.whenReady().then(async()=>{
    try{server=await startServer(port,{workspaceDirectory:path.join(app.getPath('userData'),'workspace')});}catch(error){dialog.showErrorBox('HyperAccts could not start',error.code==='EADDRINUSE'?`Another app is using port ${port}. Close the other HyperAccts window or local service, then reopen this build.`:'The local workspace service could not start. Check folder permissions and available disk space, then reopen HyperAccts.');app.quit();return;}
    window=new BrowserWindow({width:1420,height:960,minWidth:980,minHeight:680,title:'HyperAccts',icon:path.join(here,'icon.ico'),backgroundColor:'#f5f7f5',autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});
    window.webContents.setWindowOpenHandler(({url})=>{external(url);return {action:'deny'};});
    window.webContents.on('will-navigate',(e,url)=>{if(new URL(url).origin!==origin){e.preventDefault();external(url);}});
    window.webContents.session.setPermissionRequestHandler((_contents,_permission,callback)=>callback(false));
    window.webContents.on('will-prevent-unload',event=>{
      const choice=dialog.showMessageBoxSync(window,{type:'question',buttons:['Keep open','Close anyway'],defaultId:0,cancelId:0,title:'Workspace save in progress',message:'The latest changes are still being saved.',detail:'Keep the app open until Workspace settings shows “Saved to this computer”. A browser recovery copy is kept when available.'});
      if(choice===1)event.preventDefault();
    });
    try{await window.loadURL(origin);}catch{dialog.showErrorBox('HyperAccts could not load','The local interface could not be loaded. Reopen the app; saved workspace files have not been removed.');app.quit();}
  });
  app.on('window-all-closed',()=>app.quit());
  app.on('before-quit',()=>server?.close());
}
