import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const browser=await puppeteer.launch({executablePath:CHROME,headless:'shell',args:['--headless=new','--hide-scrollbars','--mute-audio','--use-angle=swiftshader','--enable-unsafe-swiftshader','--window-size=1680,1500'],defaultViewport:{width:1680,height:1500}});
const page=await browser.newPage();
await page.goto('http://localhost:5173/?flat=1',{waitUntil:'networkidle2',timeout:60000});
await sleep(2500);
await page.evaluate(()=>{const el=document.getElementById('affordance');const r=el.getBoundingClientRect();window.scrollTo({top:window.scrollY+r.top+el.offsetHeight*0.5-window.innerHeight*0.5,behavior:'instant'});});
await sleep(2000);
// crop just the twin panels region for compact inspection
for(let i=0;i<7;i++){await sleep(1150);await page.screenshot({path:`../data/shots-lab/burst-${i}.png`});}
console.log('done');
