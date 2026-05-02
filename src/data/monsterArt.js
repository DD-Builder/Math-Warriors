/**
 * Monster & boss art draw functions — ported from the v0.2 reference.
 *
 * Each function takes (R, t) where R is an Rndr instance and t is
 * elapsed seconds for animation. The Rndr system draws relative to
 * the canvas center.
 *
 * These are pure Canvas 2D draw functions with no Phaser dependencies.
 * The bridge in monsterSprites.js renders them to offscreen canvases.
 *
 * Monsters are added per-floor in batches to avoid API timeouts.
 */

import { drawOpSym } from '../ui/legacyRenderer.js';

// ─── FLOOR 1: GARDEN ────────────────────────────────────────────
// Placeholder — monster draw functions will be added in subsequent batches.
// For now, export empty arrays that get populated.

export var FLOOR1_MONSTERS = {
sproutling: function(R,t){
var G=R.G,bob=Math.sin(t*.054)*4;
G.save();G.translate(0,bob);
R.L([[-8,34],[-6,34],[-10,68],[-16,70],[-20,64],[-14,52]],'#291604',11,{sx:3,sy:5,sp:9,sa:.46});
R.L([[-7,36],[-4,52],[-2,62],[-6,66],[-10,62]],'#3a2210',12,{sx:2,sy:3,sp:6,sa:.3});
R.L([[6,34],[8,34],[14,52],[20,64],[16,70],[10,68]],'#291604',13,{sx:3,sy:5,sp:9,sa:.46});
R.L([[7,36],[4,52],[2,62],[6,66],[10,62]],'#3a2210',14,{sx:2,sy:3,sp:6,sa:.3});
R.L([[-10,10],[-30,2],[-40,-4],[-38,-12],[-26,-8],[-8,6]],'#291604',15,{sx:3,sy:4,sp:8,sa:.44});
R.L([[10,10],[30,2],[40,-4],[38,-12],[26,-8],[8,6]],'#291604',16,{sx:3,sy:4,sp:8,sa:.44});
R.L([[-8,-2],[8,-2],[6,36],[-6,36]],'#3a5414',20,{sx:3,sy:5,sp:10,sa:.42});
R.L([[-5,0],[5,0],[4,34],[-4,34]],'#4e7a1c',21,{sx:2,sy:3,sp:6,sa:.28});
R.L([[-60,-8],[-64,-28],[-56,-50],[-40,-64],[-20,-72],[2,-74],[22,-70],[40,-60],[52,-44],[58,-24],[54,-8],[36,-2],[18,0],[-18,0],[-38,-2]],'#7a2c0c',30,{sx:4,sy:7,sp:22,sa:.52});
R.L([[-54,-8],[-58,-26],[-50,-46],[-34,-58],[-16,-66],[2,-68],[20,-64],[36,-54],[48,-40],[52,-22],[48,-8],[30,-2],[14,0],[-14,0],[-32,-2]],'#b04414',31,{sx:3,sy:5,sp:14,sa:.42});
R.L([[-40,-10],[-42,-24],[-34,-42],[-20,-52],[2,-56],[18,-52],[32,-42],[38,-26],[36,-10],[20,0],[2,0],[-18,0]],'#d0621a',32,{sx:2,sy:3,sp:8,sa:.28});
var spots=[[-4,-52],[22,-44],[-26,-36],[14,-66],[34,-56],[-38,-20]];
spots.forEach(function(p,i){var s=5+i%3*2;R.L([[p[0]-s,p[1]],[p[0]+s*.6,p[1]-3],[p[0]+s+2,p[1]+s*.5],[p[0],p[1]+s+1],[p[0]-s-1,p[1]+s*.4]],'#f0e8d0',40+i,{sx:1,sy:2,sp:5,sa:.28});});
G.save();G.strokeStyle='rgba(90,24,8,.3)';G.lineWidth=1.8;G.beginPath();G.moveTo(2,-68);G.lineTo(2,-2);G.stroke();G.beginPath();G.moveTo(-52,-26);G.lineTo(48,-26);G.stroke();G.restore();
R.L([[-22,-12],[-8,-16],[-6,-10],[-18,-8]],'#0e0804',50,{ns:true});
R.L([[6,-16],[20,-12],[18,-8],[4,-10]],'#0e0804',51,{ns:true});
R.L([[-26,-14],[-6,-20],[-4,-14],[-22,-10]],'#4c1408',52,{sx:1,sy:1,sp:4,sa:.4});
R.L([[4,-20],[24,-14],[22,-10],[2,-14]],'#4c1408',53,{sx:1,sy:1,sp:4,sa:.4});
R.L([[-14,-4],[-8,-6],[0,-5],[8,-6],[14,-4],[10,-2],[4,-4],[0,-2],[-4,-4],[-10,-2]],'#1c0a04',54,{ns:true});
for(var i=0;i<6;i++){var ph=((t*.016+i*.28)%1),px=[-32,-14,4,18,34,-8][i],py=-10-ph*44,al=(1-ph)*.5;if(al>.05){G.save();G.globalAlpha=al;R.Le(px,py,3+ph*5,3+ph*3,'#c8b81a',60+i,{ns:true,sx:0,sy:0,sp:2,sa:.2});G.restore();}}
R.gshadow(0,72,26,5);G.restore();
},
thornwall: function(R,t){
var G=R.G,roll=Math.sin(t*.04)*9,bob=Math.sin(t*.035)*3;
G.save();G.translate(roll*.35,bob);
var cp=[];for(var i=0;i<16;i++){var a=i/16*Math.PI*2,r=26+Math.sin(i*2.1+1.3)*6;cp.push([Math.cos(a)*r,Math.sin(a)*r]);}
R.L(cp,'#0c1e08',1,{sx:4,sy:7,sp:16,sa:.54});
R.L(cp.map(function(p){return[p[0]*.78,p[1]*.78];}),'#1a3c0e',2,{sx:3,sy:5,sp:10,sa:.42});
R.L(cp.map(function(p){return[p[0]*.54,p[1]*.54];}),'#2c5c18',3,{sx:2,sy:3,sp:6,sa:.28});
var angles=[0,.42,.86,1.28,1.72,2.14,2.58,3.0,3.42,3.86,4.28,4.72,5.16,5.58,.22,.64,1.07,1.5,1.93,2.36];
angles.forEach(function(a,i){var tl=30+Math.sin(i*1.9)*10,tw=5+i%3*2;var bx=Math.cos(a)*24,by=Math.sin(a)*24;var tx=Math.cos(a)*(24+tl),ty=Math.sin(a)*(24+tl);var nx=Math.cos(a+Math.PI/2),ny=Math.sin(a+Math.PI/2);R.L([[bx+nx*tw*.5,by+ny*tw*.5],[tx+nx*1.5,ty+ny*1.5],[tx,ty],[tx-nx*1.5,ty-ny*1.5],[bx-nx*tw*.5,by-ny*tw*.5]],'#3a1204',10+i,{sx:2,sy:4,sp:6,sa:.5});R.L([[bx+nx*tw*.25,by+ny*tw*.25],[tx,ty],[bx-nx*tw*.25,by-ny*tw*.25]],'#6a2406',11+i,{sx:1,sy:2,sp:3,sa:.32});R.L([[tx,ty],[tx+Math.cos(a+.7)*7,ty+Math.sin(a+.7)*7],[tx+Math.cos(a)*3,ty+Math.sin(a)*3]],'#3a1204',12+i,{sx:1,sy:2,sp:3,sa:.4});});
R.glow(0,0,14,14,'#8c1010',.55,10);R.glow(0,0,6,6,'#c02020',.38,4);
G.save();G.fillStyle='#cc1c0c';G.globalAlpha=.6;G.beginPath();G.arc(-6,2,2.5,0,Math.PI*2);G.fill();G.beginPath();G.arc(7,-1,2.5,0,Math.PI*2);G.fill();G.restore();
R.gshadow(0,36,36,6);G.restore();
},
blossomfiend: function(R,t){
var G=R.G,bob=Math.sin(t*.05)*3,snap=Math.abs(Math.sin(t*.027))*10;
G.save();G.translate(0,bob);
R.L([[-8,62],[8,62],[10,74],[6,78],[-6,78],[-10,74]],'#1c3006',1,{sx:3,sy:4,sp:8,sa:.44});
R.L([[-12,64],[-20,70],[-16,76],[-8,74]],'#1c3006',2,{sx:2,sy:3,sp:5,sa:.38});
R.L([[12,64],[20,70],[16,76],[8,74]],'#1c3006',3,{sx:2,sy:3,sp:5,sa:.38});
R.L([[-10,62],[-12,38],[-6,18],[-2,-2],[-6,-20]],'#1c3006',10,{sx:3,sy:6,sp:12,sa:.46});
R.L([[10,62],[12,38],[6,18],[2,-2],[6,-20]],'#1c3006',11,{sx:3,sy:6,sp:12,sa:.46});
R.L([[-6,60],[-8,38],[-2,18],[0,-2],[-2,-18]],'#2e5010',12,{sx:2,sy:4,sp:8,sa:.3});
R.L([[6,60],[8,38],[2,18],[0,-2],[2,-18]],'#2e5010',13,{sx:2,sy:4,sp:8,sa:.3});
R.L([[0,24],[24,14],[40,22],[38,36],[20,40],[4,32]],'#1e480a',20,{sx:3,sy:5,sp:12,sa:.44});
R.L([[4,26],[22,16],[36,22],[34,34],[20,38],[6,30]],'#2e6e12',21,{sx:2,sy:3,sp:7,sa:.28});
R.L([[0,24],[-24,14],[-40,22],[-38,36],[-20,40],[-4,32]],'#1e480a',22,{sx:3,sy:5,sp:12,sa:.44});
R.L([[0,24],[-22,16],[-36,22],[-34,34],[-20,38],[-4,30]],'#2e6e12',23,{sx:2,sy:3,sp:7,sa:.28});
[-1.8,-1.1,-.4,.3,1,.7,2.4,3.1].forEach(function(a,i){var px=Math.cos(a)*30,py=Math.sin(a)*30-28;R.L([[px-4,py-2],[px+4,py-2],[px+5,py+13],[px,py+17],[px-5,py+13]],'#bc2c5a',30+i,{sx:2,sy:3,sp:7,sa:.44});R.L([[px-2,py],[px+2,py],[px+3,py+9],[px,py+12],[px-3,py+9]],'#e04870',31+i,{sx:1,sy:2,sp:4,sa:.28});});
R.L([[-34,-12+snap],[34,-12+snap],[36,-14+snap],[28,-4+snap],[0,2+snap],[-28,-4+snap],[-36,-14+snap]],'#540a1a',40,{sx:4,sy:6,sp:16,sa:.52});
R.L([[-28,-10+snap],[28,-10+snap],[28,-6+snap],[0,-1+snap],[-28,-6+snap]],'#881826',41,{sx:3,sy:4,sp:10,sa:.4});
for(var ti=-3;ti<=3;ti++){if(ti===0)continue;var tx=ti*8,th=ti%2===0?10:7;R.L([[tx-3,-12+snap],[tx+3,-12+snap],[tx,snap-12+th]],'#e8dcc0',42+ti+4,{sx:1,sy:2,sp:3,sa:.32,ns:true});}
R.L([[-34,-20],[34,-20],[36,-22],[28,-38],[0,-44],[-28,-38],[-36,-22]],'#540a1a',50,{sx:4,sy:6,sp:16,sa:.54});
R.L([[-28,-20],[28,-20],[28,-24],[0,-38],[-28,-24]],'#881826',51,{sx:3,sy:4,sp:10,sa:.42});
for(var ti2=-3;ti2<=3;ti2++){if(ti2===0)continue;var tx2=ti2*8,th2=ti2%2===0?12:8;R.L([[tx2-3,-20],[tx2+3,-20],[tx2,-20-th2]],'#e8dcc0',52+ti2+4,{sx:1,sy:2,sp:3,sa:.32,ns:true});}
R.glow(0,-14+snap*.5,6,4,'#f0c01e',.85,5);
R.L([[-2,-12+snap*.5],[2,-12+snap*.5],[1,-17+snap*.5],[-1,-17+snap*.5]],'#b89010',60,{sx:1,sy:1,sp:3,sa:.4});
R.L([[-14,-28],[-8,-34],[-2,-28],[-8,-22]],'#0c0806',61,{ns:true});R.glow(-8,-28,4,3,'#58cc0e',.85,4);
R.L([[2,-34],[8,-40],[14,-34],[8,-28]],'#0c0806',62,{ns:true});R.glow(8,-34,4,3,'#58cc0e',.85,4);
R.gshadow(0,80,22,5);G.restore();
},
puffshroom: function(R,t){
var G=R.G,bob=Math.sin(t*.05)*5,sq=Math.sin(t*.042)*.05;
G.save();G.translate(0,bob);G.scale(1+sq*.35,1-sq*.55);
R.L([[-18,56],[-4,52],[0,66],[-8,70],[-20,68],[-22,60]],'#183008',1,{sx:3,sy:4,sp:8,sa:.46});
R.L([[4,52],[18,56],[22,60],[20,68],[8,70],[0,66]],'#183008',2,{sx:3,sy:4,sp:8,sa:.46});
R.L([[-14,58],[-4,54],[-2,64],[-8,66],[-14,64],[-16,60]],'#284a10',3,{sx:2,sy:3,sp:5,sa:.32});
R.L([[4,54],[14,58],[16,60],[14,64],[8,66],[2,64]],'#284a10',4,{sx:2,sy:3,sp:5,sa:.32});
R.L([[-8,48],[8,48],[6,56],[-6,56]],'#284a10',5,{sx:2,sy:4,sp:7,sa:.42});
R.L([[-54,12],[-60,-6],[-58,-28],[-50,-48],[-36,-62],[-18,-70],[0,-74],[18,-70],[36,-62],[50,-48],[58,-28],[60,-6],[54,12],[36,18],[18,22],[0,24],[-18,22],[-36,18]],'#8a6a0c',10,{sx:5,sy:8,sp:24,sa:.54});
R.L([[-48,10],[-54,-4],[-52,-24],[-44,-44],[-30,-56],[-14,-64],[0,-68],[14,-64],[30,-56],[44,-44],[52,-24],[54,-4],[48,10],[32,16],[16,20],[0,22],[-16,20],[-32,16]],'#bea010',11,{sx:4,sy:6,sp:17,sa:.44});
R.L([[-36,8],[-40,-2],[-38,-18],[-28,-32],[-14,-42],[0,-46],[14,-42],[28,-32],[38,-18],[40,-2],[36,8],[22,14],[0,16],[-22,14]],'#e6c018',12,{sx:3,sy:4,sp:10,sa:.3});
G.save();G.strokeStyle='rgba(70,46,0,.32)';G.lineWidth=2.2;[[-28,-42],[-8,-60],[16,-62],[36,-44],[50,-16]].forEach(function(p,i){G.beginPath();G.moveTo(p[0],p[1]);G.lineTo(p[0]*(.25+i*.04),p[1]*.38);G.stroke();});G.restore();
var pores=[[-12,-36],[14,-46],[0,-64],[-32,-22],[30,-18]];
pores.forEach(function(p,i){R.Le(p[0],p[1],7,4,'#352404',30+i,{sx:1,sy:2,sp:4,sa:.48});for(var j=0;j<5;j++){var ph=((t*.042+i*.38+j*.17)%1),jy=p[1]-ph*46,al=(1-ph)*.52;G.save();G.globalAlpha=al;R.Le(p[0]+(j-2)*2.5,jy,2.5+ph*3,2+ph*2,'#d2be16',40+i*5+j,{ns:true,sx:0,sy:0,sp:2,sa:.2});G.restore();}});
R.L([[-18,16],[-6,12],[-4,18],[-14,20]],'#0e0804',50,{ns:true});
R.L([[6,12],[18,16],[14,20],[4,18]],'#0e0804',51,{ns:true});
R.L([[-8,22],[-4,20],[0,21],[4,20],[8,22],[6,24],[0,23],[-6,24]],'#0e0804',52,{ns:true});
R.gshadow(0,72,32,5);G.restore();
},
briarking: function(R,t){
var G=R.G,bob=Math.sin(t*.036)*3,sway=Math.sin(t*.022)*.024;
G.save();G.translate(0,bob);G.rotate(sway);
var DK='#0c1604',BK='#1e2e08',MD='#2c4410',LT='#3e6018',BARK='#2c1c08',BRKL='#4a3010',THN='#5a0e06',THNL='#8c1e0c';
R.L([[-26,64],[-10,60],[-6,74],[-10,80],[-28,78],[-32,70]],BARK,1,{sx:3,sy:5,sp:10,sa:.48});
R.L([[10,60],[26,64],[32,70],[28,78],[10,80],[6,74]],BARK,2,{sx:3,sy:5,sp:10,sa:.48});
R.L([[-26,26],[-8,24],[-6,64],[-24,66]],DK,3,{sx:3,sy:6,sp:13,sa:.52});
R.L([[8,24],[26,26],[24,66],[6,64]],DK,4,{sx:3,sy:6,sp:13,sa:.52});
R.L([[-20,28],[-10,26],[-8,62],[-18,64]],BK,5,{sx:2,sy:4,sp:9,sa:.36});
R.L([[10,26],[20,28],[18,64],[8,62]],BK,6,{sx:2,sy:4,sp:9,sa:.36});
R.L([[-30,-6],[-48,0],[-56,22],[-52,48],[-36,64],[-22,64],[-10,28]],DK,10,{sx:4,sy:7,sp:18,sa:.46});
R.L([[-28,-4],[-44,2],[-50,22],[-46,46],[-32,60],[-20,60],[-8,28]],MD,11,{sx:3,sy:5,sp:12,sa:.32});
[[-38,12],[-46,30],[-42,48],[-28,56]].forEach(function(p,i){R.L([[p[0]-6,p[1]],[p[0]+2,p[1]-8],[p[0]+8,p[1]],[p[0]+2,p[1]+8]],LT,12+i,{sx:2,sy:3,sp:6,sa:.3});R.ln(p[0]+2,p[1]-8,p[0]+2,p[1]+8,'rgba(8,16,2,.3)',1,.6);});
R.L([[-28,-6],[28,-6],[32,26],[-32,26]],DK,20,{sx:4,sy:6,sp:17,sa:.54});
R.L([[-24,-2],[24,-2],[28,22],[-28,22]],BARK,21,{sx:3,sy:4,sp:11,sa:.42});
R.L([[-14,2],[14,2],[16,18],[-16,18]],BRKL,22,{sx:2,sy:3,sp:7,sa:.28});
R.ln(-14,10,14,10,'rgba(8,4,0,.38)',1.8,.7);R.ln(0,-2,0,22,'rgba(8,4,0,.38)',1.8,.7);
R.L([[-42,-12],[-16,-24],[-6,-16],[-14,-2],[-40,-2]],DK,30,{sx:3,sy:5,sp:14,sa:.52});
R.L([[-38,-10],[-16,-22],[-8,-14],[-14,-2],[-36,-2]],BK,31,{sx:2,sy:3,sp:9,sa:.38});
R.L([[16,-24],[42,-12],[36,-2],[6,-16]],DK,32,{sx:3,sy:5,sp:14,sa:.52});
R.L([[16,-22],[38,-10],[34,-2],[8,-14]],BK,33,{sx:2,sy:3,sp:9,sa:.38});
[[-30,-24],[-20,-28],[-10,-20],[10,-20],[20,-28],[30,-24]].forEach(function(p,i){var h=[14,20,16,16,18,12][i];R.L([[p[0]-3,p[1]],[p[0]+3,p[1]],[p[0]+1,p[1]-h],[p[0],p[1]-h-3],[p[0]-1,p[1]-h]],THN,40+i,{sx:2,sy:3,sp:5,sa:.48});R.L([[p[0]-1,p[1]],[p[0]+1,p[1]],[p[0],p[1]-h+2]],THNL,41+i,{sx:1,sy:1,sp:2,sa:.3});R.glow(p[0],p[1]-h-2,3,3,THNL,.4,4);});
R.L([[-54,-14],[-28,-26],[-18,-16],[-24,-4],[-50,0]],DK,50,{sx:3,sy:5,sp:13,sa:.52});
R.L([[-50,-12],[-28,-24],[-20,-14],[-24,-4],[-46,0]],BARK,51,{sx:2,sy:3,sp:8,sa:.36});
R.L([[28,-26],[54,-14],[50,0],[18,-16]],DK,52,{sx:3,sy:5,sp:13,sa:.52});
R.L([[28,-24],[50,-12],[46,0],[20,-14]],BARK,53,{sx:2,sy:3,sp:8,sa:.36});
[[-52,0],[-56,10],[-54,22],[-48,30]].forEach(function(p,i){R.L([[p[0]-2,p[1]],[p[0]+2,p[1]],[p[0]+2,p[1]+12],[p[0],p[1]+14],[p[0]-2,p[1]+12]],THN,60+i,{sx:1,sy:2,sp:4,sa:.46});});
[[52,0],[56,10],[54,22],[48,30]].forEach(function(p,i){R.L([[p[0]-2,p[1]],[p[0]+2,p[1]],[p[0]+2,p[1]+12],[p[0],p[1]+14],[p[0]-2,p[1]+12]],THN,64+i,{sx:1,sy:2,sp:4,sa:.46});});
R.L([[-24,-42],[24,-42],[26,-12],[-26,-12]],DK,70,{sx:4,sy:6,sp:15,sa:.54});
R.L([[-20,-38],[20,-38],[22,-14],[-22,-14]],BARK,71,{sx:3,sy:4,sp:10,sa:.42});
R.L([[-12,-34],[12,-34],[12,-16],[-12,-16]],BRKL,72,{sx:2,sy:3,sp:6,sa:.28});
[-22,-15,-8,0,8,15,22].forEach(function(x,i){var h=[18,24,20,28,20,22,16][i];R.L([[x-3,-42],[x+3,-42],[x+1,-42-h],[x,-42-h-3],[x-1,-42-h]],THN,80+i,{sx:2,sy:4,sp:7,sa:.5});R.L([[x-1,-42],[x+1,-42],[x,-42-h+2]],THNL,81+i,{sx:1,sy:1,sp:2,sa:.3});R.glow(x,-42-h-2,3,3,THNL,.42,4);});
R.L([[-14,-28],[-6,-33],[0,-28],[-6,-23]],'#080c04',82,{ns:true});R.glow(-6,-28,5,3,'#6ec01e',.85,5);
R.L([[0,-33],[6,-38],[14,-33],[6,-28]],'#080c04',83,{ns:true});R.glow(6,-33,5,3,'#6ec01e',.85,5);
R.L([[-10,-18],[-6,-20],[0,-19],[6,-20],[10,-18],[8,-16],[0,-17],[-8,-16]],'#040802',84,{ns:true});
R.gshadow(0,84,30,6);G.restore();
},
};
export var FLOOR2_MONSTERS = {
drifter: function(R,t){
var G=R.G,bob=Math.sin(t*.03)*9,pulse=Math.sin(t*.04)*.06;
G.save();G.translate(0,bob);
for(var i=0;i<12;i++){var tx0=(i/11-.5)*48;var pts=[[tx0,28]];for(var s=1;s<=10;s++){var p=s/10,wv=Math.sin(t*.04+i*.88+s*.55)*20*p;pts.push([tx0+wv,28+p*80]);}G.save();G.strokeStyle=i%4===0?'#142e50':'#0c2038';G.lineWidth=4-i*.12;G.lineCap='round';G.globalAlpha=.8;G.beginPath();G.moveTo(pts[0][0],pts[0][1]);for(var s2=1;s2<pts.length;s2++)G.lineTo(pts[s2][0],pts[s2][1]);G.stroke();G.strokeStyle='#1e3e60';G.lineWidth=1.5;G.globalAlpha=.28;G.beginPath();G.moveTo(pts[0][0],pts[0][1]);for(var s3=1;s3<pts.length;s3++)G.lineTo(pts[s3][0],pts[s3][1]);G.stroke();G.restore();var tip=pts[pts.length-1];R.glow(tip[0],tip[1],3,3,'#3aa0d8',.5,4);}
G.save();G.scale(1+pulse*.35,1-pulse*.55);
R.L([[-36,0],[-40,-12],[-36,-26],[-24,-36],[-10,-42],[0,-44],[10,-42],[24,-36],[36,-26],[40,-12],[36,0],[22,6],[0,10],[-22,6]],'#0c1836',10,{sx:4,sy:6,sp:16,sa:.54});
R.L([[-30,0],[-34,-10],[-30,-22],[-20,-30],[-8,-36],[0,-38],[8,-36],[20,-30],[30,-22],[34,-10],[30,0],[18,4],[0,7],[-18,4]],'#162a50',11,{sx:3,sy:4,sp:10,sa:.42});
R.L([[-20,0],[-22,-6],[-18,-16],[-10,-22],[0,-24],[10,-22],[18,-16],[22,-6],[20,0],[12,3],[0,5],[-12,3]],'#203a6e',12,{sx:2,sy:3,sp:6,sa:.28});
R.glow(0,-16,22,12,'#2a60a8',.18,12);
R.L([[-14,-18],[14,-18],[14,-14],[-14,-14]],'#2870a8',13,{sx:1,sy:2,sp:6,sa:.44});
R.glow(0,-16,12,3,'#3898d8',.48,5);
for(var f=-34;f<=34;f+=7){R.L([[f-2,0],[f+2,0],[f+1,7],[f-1,7]],'#162a50',14+(f+36),{sx:1,sy:1,sp:3,sa:.38});}
R.L([[-12,-12],[-6,-16],[0,-12],[-6,-8]],'#030810',20,{ns:true});R.glow(-6,-12,3,3,'#58b8e8',.75,3);
R.L([[0,-16],[6,-20],[12,-16],[6,-12]],'#030810',21,{ns:true});R.glow(6,-16,3,3,'#58b8e8',.75,3);
G.restore();
R.gshadow(0,34,38,5);G.restore();
},
gulper: function(R,t){
var G=R.G,bob=Math.sin(t*.033)*5,lureSway=Math.sin(t*.05)*16,lureBob=Math.cos(t*.07)*6;
G.save();G.translate(0,bob);
R.L([[28,14],[52,4],[58,14],[52,26],[28,20]],'#080e1e',1,{sx:3,sy:4,sp:10,sa:.44});
R.L([[30,16],[48,8],[52,15],[48,22],[30,18]],'#101828',2,{sx:2,sy:3,sp:6,sa:.3});
R.L([[-8,-16],[30,-14],[34,18],[-6,20]],'#0a1020',3,{sx:3,sy:5,sp:14,sa:.5});
R.L([[-4,-12],[28,-10],[30,14],[-2,16]],'#121c30',4,{sx:2,sy:4,sp:9,sa:.36});
R.L([[6,-14],[24,-14],[20,-28],[14,-36],[6,-28]],'#101828',5,{sx:2,sy:4,sp:9,sa:.4});
R.L([[-58,-8],[30,-10],[34,-6],[28,6],[-54,10],[-62,2]],'#060810',20,{sx:4,sy:7,sp:22,sa:.58});
R.L([[-52,-6],[28,-8],[30,-4],[24,4],[-48,8],[-56,2]],'#0e1422',21,{sx:3,sy:5,sp:14,sa:.46});
R.L([[-58,10],[28,10],[32,16],[18,30],[-8,36],[-42,30],[-62,20]],'#060810',22,{sx:4,sy:7,sp:22,sa:.58});
R.L([[-52,12],[26,12],[28,16],[16,28],[-6,32],[-40,28],[-58,20]],'#131f33',23,{sx:3,sy:5,sp:14,sa:.46});
[[-48,-8],[-38,-8],[-28,-8],[-18,-8],[-8,-8],[2,-8],[12,-8],[22,-8]].forEach(function(p,i){var h=i%2===0?18:11+i%3*4;R.L([[p[0]-3,p[1]],[p[0]+3,p[1]],[p[0]+1,p[1]+h],[p[0],p[1]+h+3],[p[0]-1,p[1]+h]],'#c8dce8',30+i,{sx:1,sy:2,sp:4,sa:.32,ns:true});});
[[-44,10],[-34,10],[-24,10],[-14,10],[-4,10],[6,10],[18,10]].forEach(function(p,i){var h=i%2===0?14:9+i%3*3;R.L([[p[0]-3,p[1]],[p[0]+3,p[1]],[p[0]+1,p[1]-h],[p[0],p[1]-h-3],[p[0]-1,p[1]-h]],'#c8dce8',40+i,{sx:1,sy:2,sp:4,sa:.32,ns:true});});
R.L([[22,-6],[30,-10],[32,-2],[26,4],[18,2]],'#050810',50,{sx:2,sy:3,sp:7,sa:.48});
R.L([[23,-5],[28,-8],[30,-2],[24,3],[19,2]],'#060a12',51,{sx:1,sy:2,sp:4,sa:.44});
R.L([[24,-4],[27,-6],[29,-2],[23,2]],'#1abea8',52,{sx:1,sy:1,sp:3,sa:.28});
R.glow(25,-2,5,5,'#28dac0',.58,4);
G.save();G.fillStyle='#b0f4ec';G.globalAlpha=.85;G.beginPath();G.arc(23,-4,1.8,0,Math.PI*2);G.fill();G.restore();
R.L([[14,-14],[16,-14],[10+lureSway*.4,-34],[8+lureSway,-48],[10+lureSway,-46]],'#070c18',60,{sx:2,sy:4,sp:7,sa:.44});
R.Lc(9+lureSway,-52+lureBob,8,'#060810',61,{sx:2,sy:3,sp:6,sa:.46});
R.glow(9+lureSway,-52+lureBob,10,10,'#38d898',.72,7);
R.glow(9+lureSway,-52+lureBob,5,5,'#78f8c0',.88,2.5);
R.gshadow(0,38,50,7);G.restore();
},
inkspitter: function(R,t){
var G=R.G,bob=Math.sin(t*.042)*5;
G.save();G.translate(0,bob);
var armA=[-1.22,-.82,-.42,-.02,.38,.78,1.18,1.58];
armA.forEach(function(a,i){var wv=Math.sin(t*.038+i*.86)*.26;var pts=[[0,30]];for(var s=1;s<=8;s++){var p=s/8;pts.push([Math.cos(a+wv)*p*64+Math.sin(t*.05+i*.7+s*.55)*16*p*.3,30+Math.sin(a+wv)*p*44+p*14]);}G.save();G.strokeStyle=i%3===0?'#090c22':'#0c1030';G.lineWidth=7-i*.15;G.lineCap='round';G.globalAlpha=.88;G.beginPath();G.moveTo(pts[0][0],pts[0][1]);for(var s2=1;s2<pts.length;s2++)G.lineTo(pts[s2][0],pts[s2][1]);G.stroke();G.strokeStyle='#182044';G.lineWidth=4;G.beginPath();G.moveTo(pts[0][0],pts[0][1]);for(var s3=1;s3<pts.length;s3++)G.lineTo(pts[s3][0],pts[s3][1]);G.stroke();G.restore();for(var s4=5;s4<8;s4++){var pt=pts[s4];R.Le(pt[0],pt[1],3,2,'#1e2e98',100+i*8+s4,{sx:0,sy:0,sp:3,sa:.42,ns:true});}});
R.L([[-26,30],[-30,12],[-24,-8],[-14,-26],[-6,-40],[0,-48],[6,-40],[14,-26],[24,-8],[30,12],[26,30],[14,34],[0,36],[-14,34]],'#0e1232',10,{sx:4,sy:7,sp:18,sa:.56});
R.L([[-20,28],[-24,12],[-18,-6],[-10,-22],[-4,-34],[0,-40],[4,-34],[10,-22],[18,-6],[24,12],[20,28],[12,32],[0,33],[-12,32]],'#162048',11,{sx:3,sy:5,sp:12,sa:.44});
R.L([[-12,26],[-14,12],[-8,-2],[-2,-14],[0,-22],[2,-14],[8,-2],[14,12],[12,26],[6,30],[0,31],[-6,30]],'#22306a',12,{sx:2,sy:3,sp:7,sa:.3});
R.L([[-12,10],[12,10],[12,14],[-12,14]],'#2848a0',13,{sx:1,sy:2,sp:5,sa:.44});
R.glow(0,12,10,3,'#3e5ec0',.42,5);
R.L([[-14,-2],[-8,-8],[0,-6],[6,-2],[-2,4],[-10,4]],'#080a1e',20,{sx:2,sy:3,sp:6,sa:.5});
R.L([[-11,-1],[-7,-6],[0,-4],[4,-1],[-1,3],[-8,3]],'#0a5e68',21,{sx:1,sy:2,sp:4,sa:.32});
R.glow(-5,-1,5,5,'#1ab8d8',.58,4);
G.save();G.fillStyle='#8ef0f8';G.globalAlpha=.85;G.beginPath();G.arc(-8,-3,1.8,0,Math.PI*2);G.fill();G.restore();
R.L([[2,-8],[8,-12],[14,-8],[10,-2],[2,-2]],'#080a1e',22,{sx:2,sy:3,sp:6,sa:.5});
R.L([[3,-7],[7,-10],[12,-7],[9,-3],[3,-3]],'#0a5e68',23,{sx:1,sy:2,sp:4,sa:.32});
R.glow(8,-6,5,5,'#1ab8d8',.58,4);
R.L([[-4,8],[4,8],[2,16],[0,18],[-2,16]],'#06080e',24,{sx:1,sy:2,sp:4,sa:.46});
R.L([[-2,9],[2,9],[1,14],[0,15],[-1,14]],'#cce6f0',25,{ns:true});
var inkPh=(t*.024)%1,inkR=18+inkPh*46;
R.glow(0,82,inkR,inkR*.4,'#04060e',(.42*(1-inkPh)),14);
R.gshadow(0,38,32,6);G.restore();
},
abyssaleel: function(R,t){
var G=R.G,wave=t*.037,bob=Math.sin(t*.03)*6;
G.save();G.translate(0,bob);
var N=22,spine=[];for(var i=0;i<=N;i++){var p=i/N;spine.push([Math.sin(wave+p*Math.PI*1.65)*36*(1-p*.5),-78+p*166]);}
for(var seg=0;seg<N-1;seg++){var p0=spine[seg],p1=spine[seg+1];var dx=p1[0]-p0[0],dy=p1[1]-p0[1],len=Math.sqrt(dx*dx+dy*dy)||1;var nx=-dy/len,ny=dx/len,w=16*(1-seg/N*.72);var col=seg<N*.35?'#070b1a':seg<N*.65?'#0a1028':'#0c1434';R.L([[p0[0]+nx*w,p0[1]+ny*w],[p1[0]+nx*w,p1[1]+ny*w],[p1[0]-nx*w,p1[1]-ny*w],[p0[0]-nx*w,p0[1]-ny*w]],col,seg*3,{sx:3,sy:5,sp:11,sa:.48});var w2=w*.62;R.L([[p0[0]+nx*w2,p0[1]+ny*w2],[p1[0]+nx*w2,p1[1]+ny*w2],[p1[0]-nx*w2,p1[1]-ny*w2],[p0[0]-nx*w2,p0[1]-ny*w2]],'#121e3a',seg*3+1,{sx:2,sy:3,sp:7,sa:.32});}
for(var si=2;si<N-1;si+=2){var sp=spine[si],intensity=.5+Math.sin(wave*2.1+si*.48)*.42;R.glow(sp[0],sp[1],4,4,'#18b898',intensity*.52,5);R.glow(sp[0],sp[1],2,2,'#56e4cc',intensity*.62,2);var dx2=spine[si+1][0]-spine[si-1][0],dy2=spine[si+1][1]-spine[si-1][1];var len2=Math.sqrt(dx2*dx2+dy2*dy2)||1;R.ln(sp[0],sp[1],sp[0]-dy2/len2*14,sp[1]+dx2/len2*14,'#18b898',1.2,.33*intensity);}
var tail=spine[N];R.L([[tail[0]-8,tail[1]-4],[tail[0]+8,tail[1]-4],[tail[0]+16,tail[1]+8],[tail[0]+12,tail[1]+18],[tail[0]-12,tail[1]+18],[tail[0]-16,tail[1]+8]],'#080c1a',200,{sx:3,sy:4,sp:9,sa:.46});
var head=spine[0];R.L([[head[0]-24,head[1]+2],[head[0]+24,head[1]+2],[head[0]+26,head[1]+18],[head[0]+18,head[1]+32],[head[0],head[1]+36],[head[0]-18,head[1]+32],[head[0]-26,head[1]+18]],'#05091a',210,{sx:4,sy:6,sp:16,sa:.56});
R.L([[head[0]-18,head[1]+4],[head[0]+18,head[1]+4],[head[0]+20,head[1]+16],[head[0]+12,head[1]+28],[head[0],head[1]+32],[head[0]-12,head[1]+28],[head[0]-20,head[1]+16]],'#0e1830',211,{sx:3,sy:4,sp:10,sa:.44});
R.L([[head[0]-12,head[1]+30],[head[0]-6,head[1]+30],[head[0]-8,head[1]+42],[head[0]-12,head[1]+44],[head[0]-14,head[1]+40]],'#c4d8e4',212,{sx:1,sy:2,sp:5,sa:.32});
R.L([[head[0]+6,head[1]+30],[head[0]+12,head[1]+30],[head[0]+14,head[1]+40],[head[0]+12,head[1]+44],[head[0]+8,head[1]+42]],'#c4d8e4',213,{sx:1,sy:2,sp:5,sa:.32});
R.L([[head[0]-12,head[1]+10],[head[0]-3,head[1]+8],[head[0]-2,head[1]+14],[head[0]-10,head[1]+14]],'#030610',214,{ns:true});R.glow(head[0]-7,head[1]+11,5,2,'#1cd8c8',.78,4);
R.L([[head[0]+3,head[1]+8],[head[0]+12,head[1]+10],[head[0]+10,head[1]+14],[head[0]+2,head[1]+14]],'#030610',215,{ns:true});R.glow(head[0]+7,head[1]+11,5,2,'#1cd8c8',.78,4);
R.gshadow(0,86,20,5);G.restore();
},
pressure: function(R,t){
var G=R.G,bob=Math.sin(t*.034)*6,slowSpin=Math.sin(t*.017)*.055;
G.save();G.translate(0,bob);G.rotate(slowSpin);
R.L([[0,-54],[30,-44],[46,-28],[54,0],[46,28],[30,44],[0,54],[-4,44],[-8,28],[-10,0],[-8,-28],[-4,-44]],'#060c1c',1,{sx:4,sy:7,sp:18,sa:.56});
var bands=['#0e1830','#122240','#183050','#1e3c62','#244878','#2a548a'];
for(var b=0;b<6;b++){var r2=(6-b)*8+4;var pts2=[];for(var a=-Math.PI/2;a<=Math.PI/2+.1;a+=.2){pts2.push([Math.cos(a)*r2,Math.sin(a)*r2]);}pts2=[[0,-r2]].concat(pts2).concat([[0,r2]]);R.L(pts2,bands[b],2+b,{sx:2,sy:4,sp:8,sa:.44-b*.05});}
G.save();G.strokeStyle='#1a3c78';G.lineWidth=1.5;G.globalAlpha=.32;[8,16,24,32,40,48].forEach(function(r3){G.beginPath();G.arc(0,0,r3,-Math.PI/2,Math.PI/2);G.stroke();G.beginPath();G.moveTo(0,-r3);G.lineTo(0,r3);G.stroke();});G.restore();
for(var ti=0;ti<8;ti++){var ta=-Math.PI*.62+ti*.22;var pts3=[[-10,0]];for(var ts=1;ts<=7;ts++){var p2=ts/7,tlen=28;pts3.push([-10+Math.cos(ta)*p2*tlen+Math.sin(t*.058+ti+ts)*.08*p2*tlen*9,Math.sin(ta)*p2*tlen]);}var tip2=pts3[pts3.length-1];G.save();G.strokeStyle='#0a1630';G.lineWidth=5-ti*.3;G.lineCap='round';G.beginPath();G.moveTo(pts3[0][0],pts3[0][1]);for(var ts2=1;ts2<pts3.length;ts2++)G.lineTo(pts3[ts2][0],pts3[ts2][1]);G.stroke();G.strokeStyle='#14243e';G.lineWidth=3-ti*.2;G.beginPath();G.moveTo(pts3[0][0],pts3[0][1]);for(var ts3=1;ts3<pts3.length;ts3++)G.lineTo(pts3[ts3][0],pts3[ts3][1]);G.stroke();G.restore();if(ti%2===0){R.glow(tip2[0],tip2[1],5,5,'#38b8d8',.68,5);G.save();G.fillStyle='#2898b8';G.globalAlpha=.82;G.beginPath();G.arc(tip2[0],tip2[1],3,0,Math.PI*2);G.fill();G.restore();G.save();G.fillStyle='#020406';G.globalAlpha=.9;G.beginPath();G.arc(tip2[0],tip2[1],1.5,0,Math.PI*2);G.fill();G.restore();}}
R.L([[16,-6],[22,0],[16,6],[10,0]],'#040a14',20,{ns:true});R.glow(16,0,6,6,'#38b8d8',.68,5);
G.save();G.fillStyle='#78e0f4';G.globalAlpha=.85;G.beginPath();G.arc(14,-2,2,0,Math.PI*2);G.fill();G.restore();
R.gshadow(0,56,48,8);G.restore();
},
};
export var FLOOR3_MONSTERS = {};
export var FLOOR4_MONSTERS = {};
export var FLOOR5_MONSTERS = {};
export var BOSSES = {};
