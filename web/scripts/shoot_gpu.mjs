import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const targets=process.argv[2].split(',');
const out=process.argv[3]||'/Users/lahpmx/Claude/kinesis-pitch/data/shots-gpu';
import {mkdirSync} from 'node:fs'; mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const b=await puppeteer.launch({executablePath:CHROME,headless:false,
  args:['--hide-scrollbars','--mute-audio','--window-size=1680,1050','--window-position=0,0'],
  defaultViewport:{width:1680,height:1050}, protocolTimeout:600000});
const p=await b.newPage();
p.on('pageerror',e=>console.log('PAGEERROR:',e.message.slice(0,160)));
await p.goto('http://localhost:5173/pitch.html',{waitUntil:'networkidle2',timeout:120000});
await p.waitForFunction(()=>window.__deckReady!==undefined,{timeout:60000}).catch(()=>{});
await sleep(3000);
for(const t of targets){
  const [beat,stage]=t.split('.');
  await p.evaluate((h)=>{window.__stageSettled=false;location.hash=h;},`#/${beat}/${stage}`);
  await p.waitForFunction(()=>window.__stageSettled===true,{timeout:120000}).catch(()=>console.log('  (no settle)',t));
  await sleep(1500);
  await p.screenshot({path:`${out}/b${beat}_s${stage}.png`});
  console.log('shot',t);
}
await b.close(); console.log('done');
