/**
 * Hero art draw functions — ported from the v0.2 character bible.
 *
 * Each hero entry has: name, trait, color, cardBg, topExt, botExt,
 * and a draw(R, cx, cy, sc) function that renders the hero using
 * the makeRenderer API (R.L, R.Ld, R.glow, R.G).
 *
 * These are pure Canvas 2D draw functions with no Phaser dependencies.
 * The bridge in heroSprites.js renders them to offscreen canvases
 * and loads as Phaser textures.
 */

// Knights are added first; wizards and bunnies follow in subsequent batches.

export var KNIGHTS = [
{
name: 'K1: SHADOW',
id: 'knight-shadow',
trait: 'Unseen. Unstoppable.',
color: '#44888a', cardBg: '#d9cfb2', topExt: 80, botExt: 78,
draw: function(R,cx,cy,sc){
var G=R.G,L=R.L,Ld=R.Ld,glow=R.glow;
G.save();G.translate(cx,cy);G.scale(sc,sc);
var c={d:'#2a6063',b:'#44888a',m:'#7fb3ae',accent:'#d06a4d',accentL:'#e78f6c',gold:'#e39a4a',gL:'#ecb964'};
L([[-14,-40],[-26,-32],[-50,-2],[-54,26],[-48,62],[-16,64],[-6,26],[-6,-4]],c.d,1,{sx:5,sy:9,sp:26,sa:0.5});
L([[-48,24],[-52,0],[-28,-28],[-18,-36],[-14,-32],[-38,0],[-44,22],[-42,54],[-16,58],[-8,24]],c.m,2,{sx:2,sy:4,sp:12,sa:0.26});
L([[-18,26],[-6,24],[-6,60],[-18,62]],c.d,10,{sx:2,sy:4,sp:12});
L([[6,24],[18,26],[18,62],[6,60]],c.d,11,{sx:2,sy:4,sp:12});
L([[-20,58],[-4,56],[-3,70],[-20,72]],c.d,20,{sx:3,sy:4,sp:11});
L([[4,56],[20,58],[20,72],[3,70]],c.d,21,{sx:3,sy:4,sp:11});
L([[-20,-10],[20,-10],[22,24],[-22,24]],c.b,30,{sx:3,sy:5,sp:16,sa:0.42});
L([[-8,4],[8,4],[8,10],[-8,10]],c.accent,31,{sx:1,sy:2,sp:6,sa:0.4});
L([[-2,-4],[2,-4],[2,18],[-2,18]],c.accent,32,{sx:1,sy:2,sp:5,sa:0.38});
L([[-32,-12],[-16,-20],[-8,-14],[-14,-2]],c.d,50,{sx:3,sy:5,sp:13});
L([[16,-20],[32,-12],[14,-2],[8,-14]],c.d,52,{sx:3,sy:5,sp:13});
L([[26,-70],[36,-70],[34,58],[24,58]],c.d,80,{sx:3,sy:5,sp:13,sa:0.4});
L([[27,-66],[29,-66],[29,56],[27,56]],c.accentL,81,{ns:true});
L([[22,-18],[40,-18],[40,-11],[22,-11]],c.gold,83,{sx:2,sy:4,sp:10,sa:0.38});
Ld(30,62,4,c.gold,86,{sx:1,sy:2,sp:4,sa:0.3});
L([[-20,-50],[20,-50],[22,-12],[-22,-12]],c.d,90,{sx:3,sy:6,sp:19,sa:0.48});
L([[-18,-48],[18,-48],[20,-14],[-20,-14]],c.b,91,{sx:2,sy:4,sp:13,sa:0.36});
L([[-18,-50],[18,-50],[12,-62],[0,-76],[-12,-62]],c.d,93,{sx:3,sy:5,sp:14});
L([[-18,-36],[-5,-36],[-5,-30],[-18,-30]],c.accent,94,{sx:1,sy:2,sp:6,sa:0.42});
L([[5,-36],[18,-36],[18,-30],[5,-30]],c.accent,95,{sx:1,sy:2,sp:6,sa:0.42});
L([[-20,-13],[20,-13],[20,-10],[-20,-10]],c.gold,97,{sx:2,sy:3,sp:5,sa:0.32});
G.restore();
}
},
{
name: 'K2: CRUSADER',
id: 'knight-crusader',
trait: 'Holy. Righteous. Relentless.',
color: '#3c6b4f', cardBg: '#b7c4a4', topExt: 80, botExt: 78,
draw: function(R,cx,cy,sc){
var G=R.G,L=R.L,Ld=R.Ld,glow=R.glow;
G.save();G.translate(cx,cy);G.scale(sc,sc);
var c={d:'#3c6b4f',b:'#57835f',m:'#7d9f6d',gold:'#e39a4a',gL:'#ecb964',red:'#d06a4d',rL:'#e78f6c',cream:'#f5eedd',dark:'#2a5240',glow:'#ecb964'};
L([[-18,30],[-6,30],[-6,62],[-18,64]],c.d,10,{sx:3,sy:5,sp:14});
L([[6,30],[18,30],[18,64],[6,62]],c.d,11,{sx:3,sy:5,sp:14});
L([[-20,60],[-4,58],[-2,73],[-6,76],[-22,74]],c.dark,20,{sx:3,sy:4,sp:12});
L([[4,58],[20,60],[22,74],[6,76],[2,73]],c.dark,21,{sx:3,sy:4,sp:12});
L([[-18,-8],[18,-8],[20,34],[-20,34]],c.cream,1,{sx:4,sy:6,sp:18,sa:0.38});
L([[-16,2],[16,2],[16,10],[-16,10]],c.red,2,{sx:1,sy:2,sp:7,sa:0.38});
L([[-2,-8],[2,-8],[2,34],[-2,34]],c.red,3,{sx:1,sy:2,sp:7,sa:0.36});
L([[-32,-12],[-18,-22],[-8,-15],[-20,-2]],c.d,50,{sx:3,sy:5,sp:14});
L([[18,-22],[32,-12],[18,-2],[8,-14]],c.d,52,{sx:3,sy:5,sp:14});
L([[-58,-22],[-28,-28],[-24,14],[-42,36],[-60,10]],c.d,60,{sx:5,sy:8,sp:22,sa:0.46});
L([[-55,-18],[-31,-24],[-27,12],[-42,30],[-57,8]],c.cream,61,{sx:3,sy:5,sp:13,sa:0.34});
L([[29,-72],[38,-72],[38,-2],[35,6],[29,-2]],c.m,80,{sx:3,sy:5,sp:13,sa:0.34});
L([[20,-18],[48,-18],[48,-10],[20,-10]],c.gold,83,{sx:2,sy:4,sp:10,sa:0.4});
L([[-20,-48],[20,-48],[20,-10],[-20,-10]],c.d,90,{sx:4,sy:7,sp:20,sa:0.46});
L([[-18,-46],[18,-46],[18,-12],[-18,-12]],c.b,91,{sx:3,sy:5,sp:13,sa:0.34});
glow(0,-30,17,5,c.glow,0.65,5);
L([[-20,-12],[20,-12],[20,-9],[-20,-9]],c.gold,97,{sx:2,sy:3,sp:6,sa:0.32});
G.restore();
}
},
{
name: 'K3: PALADIN',
id: 'knight-paladin',
trait: 'Light in darkness. Grace in battle.',
color: '#7c6fa8', cardBg: '#e8dec6', topExt: 80, botExt: 78,
draw: function(R,cx,cy,sc){
var G=R.G,L=R.L,Ld=R.Ld,glow=R.glow;
G.save();G.translate(cx,cy);G.scale(sc,sc);
var c={d:'#7c6fa8',b:'#9c8fc0',m:'#a4c8d8',gold:'#e39a4a',gL:'#ecb964',cream:'#f5eedd',dark:'#2a6063',glow:'#ecb964'};
L([[-20,-4],[20,-4],[26,62],[-26,62]],c.cream,1,{sx:5,sy:8,sp:22,sa:0.4});
L([[-18,60],[-4,58],[-3,73],[-6,76],[-20,74]],c.dark,20,{sx:3,sy:4,sp:11});
L([[4,58],[18,60],[20,74],[6,76],[3,73]],c.dark,21,{sx:3,sy:4,sp:11});
L([[-22,-12],[22,-12],[22,20],[-22,20]],c.d,30,{sx:4,sy:6,sp:17,sa:0.44});
L([[-18,-9],[18,-9],[18,17],[-18,17]],c.b,31,{sx:3,sy:4,sp:12,sa:0.34});
L([[-38,-14],[-16,-26],[-6,-17],[-16,-1],[-36,-1]],c.d,50,{sx:3,sy:5,sp:16});
L([[16,-26],[38,-14],[36,-1],[6,-17]],c.d,54,{sx:3,sy:5,sp:16});
L([[34,-76],[40,-76],[40,58],[34,58]],c.b,80,{sx:3,sy:5,sp:13,sa:0.38});
Ld(37,-80,12,c.dark,82,{sx:3,sy:5,sp:10,sa:0.44});
Ld(37,-80,9,c.gold,83,{sx:2,sy:3,sp:7,sa:0.36});
glow(37,-80,10,10,c.gL,0.6,7);
L([[-60,-22],[-30,-28],[-24,14],[-42,36],[-62,8]],c.d,60,{sx:5,sy:8,sp:21,sa:0.48});
Ld(-44,4,13,c.m,62,{sx:2,sy:3,sp:8,sa:0.28});
Ld(-44,4,7,c.gold,63,{sx:1,sy:2,sp:4,sa:0.34});
L([[-22,-50],[22,-50],[24,-12],[-24,-12]],c.d,90,{sx:4,sy:7,sp:19,sa:0.48});
L([[-20,-48],[20,-48],[22,-14],[-22,-14]],c.b,91,{sx:3,sy:5,sp:13,sa:0.34});
Ld(0,-34,9,c.cream,93,{sx:2,sy:3,sp:8,sa:0.32});
L([[-7,-50],[-10,-60],[-4,-66],[0,-70],[4,-66],[10,-60],[7,-50]],c.gold,100,{sx:2,sy:4,sp:11,sa:0.4});
glow(0,-34,8,8,c.gL,0.55,5);
G.restore();
}
},
{
name: 'K4: BERSERKER',
id: 'knight-berserker',
trait: 'Pure fury. Zero chill.',
color: '#d06a4d', cardBg: '#f2bf9a', topExt: 82, botExt: 80,
draw: function(R,cx,cy,sc){
var G=R.G,L=R.L,Ld=R.Ld,glow=R.glow;
G.save();G.translate(cx,cy);G.scale(sc,sc);
var c={d:'#d06a4d',b:'#e78f6c',m:'#f2bf9a',gold:'#e39a4a',gL:'#ecb964',dark:'#2a6063',metal:'#44888a',metalL:'#7fb3ae',glow:'#e39a4a'};
L([[-10,-44],[-20,-36],[-44,-8],[-48,20],[-44,60],[-16,62],[-6,26]],c.b,1,{sx:5,sy:8,sp:21,sa:0.42});
L([[-24,24],[-8,22],[-7,62],[-24,64]],c.d,10,{sx:3,sy:5,sp:14});
L([[8,22],[24,24],[24,64],[7,62]],c.d,11,{sx:3,sy:5,sp:14});
L([[-26,60],[-6,58],[-5,74],[-10,78],[-28,76]],c.dark,20,{sx:3,sy:5,sp:13});
L([[6,58],[26,60],[28,76],[10,78],[5,74]],c.dark,21,{sx:3,sy:5,sp:13});
L([[-26,-10],[26,-10],[28,26],[-28,26]],c.metal,30,{sx:4,sy:6,sp:17,sa:0.44});
L([[-20,-26],[-40,-14],[-38,0],[-10,-16]],c.metal,50,{sx:3,sy:5,sp:14});
L([[20,-26],[40,-14],[38,0],[10,-16]],c.metal,52,{sx:3,sy:5,sp:14});
L([[22,-62],[30,-62],[28,60],[20,60]],c.dark,80,{sx:3,sy:5,sp:13,sa:0.4});
L([[28,-58],[48,-44],[52,-30],[48,-16],[30,-8],[26,-16],[38,-28],[40,-42],[28,-50]],c.metal,81,{sx:4,sy:6,sp:14,sa:0.44});
L([[-22,-52],[22,-52],[24,-12],[-24,-12]],c.metal,90,{sx:4,sy:7,sp:20,sa:0.46});
L([[-22,-50],[-16,-52],[-12,-66],[-8,-72],[-4,-52],[-10,-50]],c.metal,94,{sx:3,sy:5,sp:10,sa:0.42});
L([[10,-50],[4,-52],[8,-72],[12,-66],[16,-52],[22,-50]],c.metal,95,{sx:3,sy:5,sp:10,sa:0.42});
L([[-20,-34],[20,-34],[20,-27],[-20,-27]],c.dark,96,{sx:1,sy:2,sp:7,sa:0.46});
glow(0,-30,18,4,c.glow,0.55,5);
G.restore();
}
},
{
name: 'K5: GREAT HELM',
id: 'knight-greathelm',
trait: 'Noble. Steadfast. Legendary.',
color: '#44888a', cardBg: '#a4c8d8', topExt: 84, botExt: 78,
draw: function(R,cx,cy,sc){
var G=R.G,L=R.L,Ld=R.Ld,glow=R.glow;
G.save();G.translate(cx,cy);G.scale(sc,sc);
var c={d:'#2a6063',b:'#44888a',m:'#7fb3ae',l:'#a4c8d8',gold:'#e39a4a',gL:'#ecb964',red:'#d06a4d',rL:'#e78f6c',cream:'#f5eedd',dark:'#2a6063',glow:'#ecb964'};
L([[-12,-44],[-24,-36],[-48,-6],[-52,28],[-46,60],[-16,64],[-6,28],[-6,-2]],c.red,1,{sx:5,sy:8,sp:24,sa:0.42});
L([[-20,28],[-8,26],[-7,60],[-20,62]],c.d,10,{sx:3,sy:5,sp:14});
L([[8,26],[20,28],[20,62],[7,60]],c.d,11,{sx:3,sy:5,sp:14});
L([[-22,58],[-6,56],[-4,72],[-8,76],[-24,74]],c.dark,20,{sx:3,sy:4,sp:12});
L([[6,56],[22,58],[24,74],[8,76],[4,72]],c.dark,21,{sx:3,sy:4,sp:12});
L([[-24,-12],[24,-12],[26,26],[-26,26]],c.d,30,{sx:4,sy:6,sp:18,sa:0.44});
L([[-34,-14],[-18,-24],[-8,-16],[-14,-3],[-32,-1]],c.d,50,{sx:3,sy:5,sp:14});
L([[18,-24],[34,-14],[28,-1],[8,-16]],c.d,54,{sx:3,sy:5,sp:14});
L([[-60,-26],[-30,-34],[-24,14],[-42,38],[-62,10]],c.d,60,{sx:5,sy:8,sp:22,sa:0.48});
L([[-58,-22],[-33,-30],[-27,12],[-43,32],[-60,8]],c.red,61,{sx:3,sy:5,sp:14,sa:0.36});
Ld(-42,3,6,c.gL,65,{sx:1,sy:2,sp:5,sa:0.3});
L([[29,-78],[38,-78],[38,-2],[35,6],[29,-2]],c.l,80,{sx:3,sy:5,sp:13,sa:0.36});
L([[20,-18],[48,-18],[48,-11],[20,-11]],c.gold,83,{sx:2,sy:4,sp:11,sa:0.4});
Ld(34,9,6,c.gold,86,{sx:2,sy:3,sp:6,sa:0.36});
L([[-22,-52],[22,-52],[24,-12],[-24,-12]],c.d,90,{sx:4,sy:7,sp:20,sa:0.48});
L([[-18,-52],[18,-52],[13,-62],[0,-72],[-13,-62]],c.d,93,{sx:3,sy:5,sp:14});
L([[-22,-38],[22,-38],[22,-31],[-22,-31]],c.dark,95,{sx:1,sy:3,sp:9,sa:0.48});
glow(0,-34,20,5,c.glow,0.7,5);
L([[-4,-72],[4,-72],[6,-52],[-6,-52]],c.red,100,{sx:2,sy:4,sp:11,sa:0.4});
G.restore();
}
},
];

export var WIZARDS = [
{
name: 'W1: STARGAZER',
id: 'wizard-stargazer',
trait: 'The cosmos bends to her will.',
color: '#7c6fa8', cardBg: '#a4c8d8', topExt: 80, botExt: 74,
draw: function(R,cx,cy,sc){
var G=R.G,L=R.L,Ld=R.Ld,glow=R.glow;
G.save();G.translate(cx,cy);G.scale(sc,sc);
var c={robe:'#7c6fa8',robeM:'#9c8fc0',robeL:'#a4c8d8',hat:'#7c6fa8',stars:'#ecb964',gold:'#e39a4a',gL:'#ecb964',cream:'#f5eedd',dark:'#1f4244',staff:'#2a6063',trim:'#ecb964'};
L([[-24,0],[24,0],[30,70],[-30,70]],c.robe,1,{sx:5,sy:8,sp:23,sa:0.44});
L([[-20,4],[20,4],[25,68],[-25,68]],c.robeM,2,{sx:3,sy:5,sp:15,sa:0.32});
L([[-12,8],[12,8],[15,66],[-15,66]],c.robeL,3,{sx:2,sy:3,sp:9,sa:0.22});
L([[-30,66],[30,66],[30,71],[-30,71]],c.trim,4,{sx:2,sy:4,sp:9,sa:0.36});
L([[-24,0],[-38,-16],[-48,-12],[-42,6],[-26,13]],c.robe,10,{sx:3,sy:5,sp:13,sa:0.38});
L([[24,0],[38,-16],[48,-12],[42,6],[26,13]],c.robe,12,{sx:3,sy:5,sp:13,sa:0.38});
L([[-44,-20],[-38,-20],[-34,58],[-40,58]],c.staff,30,{sx:3,sy:5,sp:12,sa:0.42});
L([[-40,-36],[-34,-42],[-28,-36],[-32,-28],[-38,-28]],c.trim,32,{sx:3,sy:5,sp:11,sa:0.4});
glow(-36,-34,7,7,'#a4c8d8',0.5,6);
Ld(0,2,5,c.gold,21,{sx:1,sy:2,sp:4,sa:0.34});
Ld(0,-9,12,c.cream,40,{sx:3,sy:4,sp:10,sa:0.34});
Ld(-4,-9,2.8,c.dark,41,{ns:true});Ld(4,-9,2.8,c.dark,42,{ns:true});
L([[-22,-9],[22,-9],[22,-6],[-22,-6]],c.hat,50,{sx:2,sy:4,sp:8,sa:0.36});
L([[-14,-9],[14,-9],[8,-36],[3,-58],[-3,-58],[-8,-36]],c.hat,51,{sx:4,sy:7,sp:19,sa:0.5});
G.save();G.fillStyle=c.stars;G.globalAlpha=0.68;
[[0,-38],[-4,-22],[4,-24],[0,-52]].forEach(function(p,i){
G.save();G.translate(p[0],p[1]);G.rotate(i*0.8);
G.beginPath();for(var k=0;k<5;k++){var a=k*Math.PI*2/5-Math.PI/2;G.lineTo(Math.cos(a)*3.5,Math.sin(a)*3.5);a+=Math.PI/5;G.lineTo(Math.cos(a)*1.8,Math.sin(a)*1.8);}
G.closePath();G.fill();G.restore();
});G.restore();
G.restore();
}
},
{
name: 'W2: TOADSTOOL',
id: 'wizard-toadstool',
trait: 'Brews chaos. Serves it hot.',
color: '#9bad87', cardBg: '#b7c4a4', topExt: 80, botExt: 74,
draw: function(R,cx,cy,sc){
var G=R.G,L=R.L,Ld=R.Ld,glow=R.glow;
G.save();G.translate(cx,cy);G.scale(sc,sc);
var c={robe:'#9bad87',robeM:'#b7c4a4',hat:'#7d9f6d',brown:'#d9cfb2',gold:'#e39a4a',cream:'#f5eedd',dark:'#1f4244',leaf:'#7d9f6d',leafL:'#b7c4a4',owl:'#d9cfb2',owlL:'#e8dec6'};
L([[-28,4],[28,4],[38,68],[-38,68]],c.robe,1,{sx:5,sy:8,sp:23,sa:0.42});
L([[-24,8],[24,8],[32,66],[-32,66]],c.robeM,2,{sx:3,sy:5,sp:15,sa:0.3});
L([[-38,64],[38,64],[38,70],[-38,70]],c.leaf,4,{sx:2,sy:4,sp:9,sa:0.36});
L([[-28,4],[-44,-10],[-52,-6],[-42,10],[-28,13]],c.robe,10,{sx:3,sy:5,sp:13,sa:0.36});
L([[28,4],[44,-10],[52,-6],[42,10],[28,13]],c.robe,12,{sx:3,sy:5,sp:13,sa:0.36});
L([[-48,-16],[-42,-16],[-38,58],[-44,58]],c.brown,30,{sx:3,sy:5,sp:12,sa:0.4});
Ld(-45,-36,8,c.leaf,34,{sx:2,sy:3,sp:7,sa:0.36});
Ld(-45,-36,5,c.leafL,35,{sx:1,sy:2,sp:4,sa:0.26});
glow(-45,-36,7,7,c.leafL,0.5,5);
Ld(30,-7,11,c.owl,36,{sx:3,sy:4,sp:9,sa:0.4});
Ld(30,-7,8,c.owlL,37,{sx:2,sy:3,sp:6,sa:0.28});
Ld(0,-8,12,c.cream,41,{sx:3,sy:4,sp:10,sa:0.34});
Ld(-4,-8,2.8,c.dark,42,{ns:true});Ld(4,-8,2.8,c.dark,43,{ns:true});
L([[-28,-8],[28,-8],[28,-5],[-28,-5]],c.hat,50,{sx:2,sy:4,sp:8,sa:0.36});
L([[-18,-8],[18,-8],[9,-36],[0,-70],[-9,-36]],c.hat,51,{sx:4,sy:7,sp:19,sa:0.48});
G.restore();
}
},
{name:'W3: SPELLBLADE',id:'wizard-spellblade',trait:'Magic fists. Still counts.',color:'#9c8fc0',cardBg:'#e8dec6',topExt:76,botExt:72,
draw:function(R,cx,cy,sc){var G=R.G,L=R.L,Ld=R.Ld,glow=R.glow;G.save();G.translate(cx,cy);G.scale(sc,sc);var c={robe:'#9c8fc0',robeM:'#a4c8d8',armor:'#44888a',gold:'#e39a4a',orb:'#7c6fa8',orbL:'#a4c8d8',cream:'#f5eedd',dark:'#1f4244',hat:'#7c6fa8'};L([[-24,2],[24,2],[26,64],[-26,64]],c.robe,1,{sx:5,sy:8,sp:21,sa:.42});L([[-32,62],[32,62],[32,68],[-32,68]],c.gold,4,{sx:2,sy:4,sp:8,sa:.34});L([[-22,-8],[22,-8],[24,16],[-24,16]],c.armor,20,{sx:4,sy:6,sp:16,sa:.44});L([[-32,-12],[-16,-22],[-8,-14],[-14,-1]],c.armor,22,{sx:3,sy:5,sp:12,sa:.38});L([[16,-22],[32,-12],[14,-1],[8,-14]],c.armor,23,{sx:3,sy:5,sp:12,sa:.38});L([[-24,2],[-34,-14],[-42,-10],[-38,6],[-26,13]],c.robe,10,{sx:3,sy:5,sp:12,sa:.36});L([[24,2],[34,-14],[42,-10],[38,6],[26,13]],c.robe,12,{sx:3,sy:5,sp:12,sa:.36});Ld(40,-22,12,c.orb,31,{sx:2,sy:4,sp:8,sa:.36});Ld(40,-22,7,c.orbL,32,{sx:1,sy:2,sp:4,sa:.24});glow(40,-22,13,13,c.orbL,.7,8);Ld(0,-9,12,c.cream,40,{sx:3,sy:4,sp:10,sa:.34});Ld(-3,-9,2.8,c.dark,41,{ns:true});Ld(3,-9,2.8,c.dark,42,{ns:true});L([[-20,-9],[20,-9],[18,-24],[12,-32],[0,-36],[-12,-32],[-18,-24]],c.hat,50,{sx:4,sy:7,sp:18,sa:.46});G.restore();}},
{name:'W4: BOOKWORM',id:'wizard-bookworm',trait:'Knows every spell. Uses them all.',color:'#d9cfb2',cardBg:'#d9cfb2',topExt:80,botExt:74,
draw:function(R,cx,cy,sc){var G=R.G,L=R.L,Ld=R.Ld,glow=R.glow;G.save();G.translate(cx,cy);G.scale(sc,sc);var c={robe:'#d9cfb2',robeM:'#e8dec6',hat:'#9c8fc0',gold:'#e39a4a',gL:'#ecb964',cream:'#f5eedd',dark:'#1f4244',wand:'#2a6063',book:'#d06a4d',bookL:'#e78f6c',glass:'#a4c8d8'};L([[-28,4],[28,4],[32,66],[-32,66]],c.robe,1,{sx:5,sy:8,sp:23,sa:.42});L([[-32,62],[32,62],[32,68],[-32,68]],c.gold,4,{sx:2,sy:4,sp:9,sa:.34});L([[-28,4],[-42,-8],[-48,-4],[-40,9],[-28,12]],c.robe,10,{sx:3,sy:5,sp:12,sa:.36});L([[28,4],[42,-8],[48,-4],[40,9],[28,12]],c.robe,12,{sx:3,sy:5,sp:12,sa:.36});L([[-50,-2],[-28,-6],[-26,16],[-48,16]],c.book,30,{sx:4,sy:6,sp:13,sa:.44});L([[-48,0],[-30,-4],[-28,14],[-46,14]],c.bookL,31,{sx:2,sy:3,sp:8,sa:.28});L([[34,-12],[38,-12],[40,18],[36,18]],c.wand,60,{sx:2,sy:4,sp:8,sa:.36});Ld(36,-16,6,c.gL,61,{sx:2,sy:3,sp:6,sa:.36});glow(36,-16,5,5,'#ecb964',.58,4);Ld(0,-7,13,c.cream,40,{sx:3,sy:4,sp:11,sa:.36});Ld(-5,-7,3.2,c.dark,41,{ns:true});Ld(5,-7,3.2,c.dark,42,{ns:true});L([[-11,-8],[-1,-8],[-1,-4],[-11,-4]],c.glass,43,{sx:1,sy:2,sp:5,sa:.3});L([[1,-8],[11,-8],[11,-4],[1,-4]],c.glass,44,{sx:1,sy:2,sp:5,sa:.3});L([[-20,-8],[20,-8],[14,-30],[0,-56],[-14,-30]],c.hat,50,{sx:4,sy:7,sp:19,sa:.48});G.restore();}},
{name:'W5: GRAND MAGE',id:'wizard-grandmage',trait:'Ancient power. Zero patience.',color:'#7c6fa8',cardBg:'#e8dec6',topExt:84,botExt:76,
draw:function(R,cx,cy,sc){var G=R.G,L=R.L,Ld=R.Ld,glow=R.glow;G.save();G.translate(cx,cy);G.scale(sc,sc);var c={robe:'#7c6fa8',robeM:'#9c8fc0',hat:'#7c6fa8',gold:'#e39a4a',gL:'#ecb964',cream:'#f5eedd',dark:'#1f4244'};L([[-22,-4],[22,-4],[28,60],[-28,60]],c.cream,1,{sx:5,sy:8,sp:22,sa:.4});L([[18,-4],[26,-4],[26,62],[18,62]],c.robe,2,{sx:2,sy:4,sp:10,sa:.3});L([[-26,-4],[-18,-4],[-18,62],[-26,62]],c.robe,3,{sx:2,sy:4,sp:10,sa:.3});L([[-26,54],[26,54],[26,62],[-26,62]],c.gold,4,{sx:2,sy:4,sp:9,sa:.34});L([[-20,-12],[20,-12],[20,18],[-20,18]],c.robe,30,{sx:4,sy:6,sp:16,sa:.44});L([[-38,-14],[-14,-26],[-5,-17],[-14,-1],[-36,-1]],c.robe,50,{sx:3,sy:5,sp:15});L([[14,-26],[38,-14],[36,-1],[5,-17]],c.robe,54,{sx:3,sy:5,sp:15});L([[-22,-4],[-34,-18],[-42,-14],[-36,6],[-24,13]],c.robe,10,{sx:3,sy:5,sp:13,sa:.36});L([[22,-4],[34,-18],[42,-14],[36,6],[24,13]],c.robe,12,{sx:3,sy:5,sp:13,sa:.36});L([[32,-74],[38,-74],[38,56],[32,56]],c.robeM,80,{sx:3,sy:5,sp:13,sa:.38});Ld(35,-78,10,c.gold,83,{sx:2,sy:3,sp:7,sa:.36});Ld(35,-78,6,c.gL,84,{sx:1,sy:2,sp:4,sa:.26});glow(35,-78,11,11,c.gL,.58,7);Ld(0,-9,12,c.cream,40,{sx:3,sy:4,sp:10,sa:.34});Ld(-3,-9,2.5,c.dark,41,{ns:true});Ld(3,-9,2.5,c.dark,42,{ns:true});L([[-26,-8],[26,-8],[26,-5],[-26,-5]],c.hat,50,{sx:2,sy:4,sp:8,sa:.36});L([[-16,-8],[16,-8],[8,-40],[0,-78],[-8,-40]],c.hat,51,{sx:4,sy:7,sp:20,sa:.5});G.save();G.fillStyle=c.gL;G.globalAlpha=.65;[[0,-48],[7,-30],[-7,-34],[3,-62],[-3,-58]].forEach(function(p,i){G.save();G.translate(p[0],p[1]);G.rotate(i*.7);G.beginPath();for(var k=0;k<5;k++){var a=k*Math.PI*2/5-Math.PI/2;G.lineTo(Math.cos(a)*4,Math.sin(a)*4);a+=Math.PI/5;G.lineTo(Math.cos(a)*2,Math.sin(a)*2);}G.closePath();G.fill();G.restore();});G.restore();G.restore();}},
];
export var BUNNIES = [
{name:'B1: PEPPER',id:'bunny-pepper',trait:'Tiny. Fast. Absolutely feral.',color:'#d06a4d',cardBg:'#f2bf9a',topExt:76,botExt:72,
draw:function(R,cx,cy,sc){var G=R.G,L=R.L,Ld=R.Ld;G.save();G.translate(cx,cy);G.scale(sc,sc);var c={fur:'#f5eedd',furD:'#d9cfb2',dark:'#1f4244',red:'#d06a4d',redL:'#e78f6c',eye:'#1f4244',nose:'#e8a09a'};L([[-20,28],[-6,24],[-4,56],[-20,58]],c.furD,10,{sx:3,sy:5,sp:12});L([[6,24],[20,28],[20,58],[4,56]],c.furD,11,{sx:3,sy:5,sp:12});L([[-22,54],[-4,52],[-2,66],[-6,69],[-24,67]],c.furD,20,{sx:3,sy:4,sp:11});L([[4,52],[22,54],[24,67],[6,69],[2,66]],c.furD,21,{sx:3,sy:4,sp:11});Ld(0,12,21,c.furD,1,{sx:4,sy:6,sp:17,sa:.4});Ld(0,12,18,c.fur,2,{sx:3,sy:4,sp:12,sa:.3});L([[-16,-2],[16,-2],[18,6],[-18,6]],c.red,40,{sx:2,sy:4,sp:10,sa:.4});L([[-20,4],[-40,-2],[-44,4],[-34,14],[-20,14]],c.furD,30,{sx:3,sy:5,sp:13,sa:.38});L([[20,4],[40,-2],[44,4],[34,14],[20,14]],c.furD,32,{sx:3,sy:5,sp:13,sa:.38});Ld(-40,0,10,c.fur,71,{sx:2,sy:3,sp:7,sa:.3});Ld(40,0,10,c.fur,72,{sx:2,sy:3,sp:7,sa:.3});Ld(0,-14,17,c.furD,50,{sx:4,sy:6,sp:15,sa:.42});Ld(0,-14,14,c.fur,51,{sx:3,sy:4,sp:11,sa:.3});L([[-14,-28],[-6,-28],[-8,-58],[-16,-58]],c.furD,53,{sx:3,sy:5,sp:14,sa:.4});L([[6,-28],[14,-28],[16,-58],[8,-58]],c.furD,56,{sx:3,sy:5,sp:14,sa:.4});L([[-16,-56],[-8,-56],[-10,-64],[-14,-64]],c.red,54,{sx:2,sy:4,sp:9,sa:.38});L([[8,-56],[16,-56],[14,-64],[10,-64]],c.red,57,{sx:2,sy:4,sp:9,sa:.38});Ld(-6,-16,4.5,'#fdfbf2',60,{sx:2,sy:3,sp:6,sa:.34});Ld(-6,-16,3,c.eye,61,{ns:true});Ld(6,-16,4.5,'#fdfbf2',62,{sx:2,sy:3,sp:6,sa:.34});Ld(6,-16,3,c.eye,63,{ns:true});Ld(0,-10,3,c.nose,66,{sx:1,sy:1,sp:3,sa:.28});G.restore();}},
{name:'B2: NOVA',id:'bunny-nova',trait:'She sparkles. Then she wins.',color:'#9c8fc0',cardBg:'#e8dec6',topExt:80,botExt:72,
draw:function(R,cx,cy,sc){var G=R.G,L=R.L,Ld=R.Ld,glow=R.glow;G.save();G.translate(cx,cy);G.scale(sc,sc);var c={fur:'#fdfbf2',furD:'#9c8fc0',dark:'#1f4244',plum:'#7c6fa8',plumL:'#9c8fc0',nose:'#e8a09a',eye:'#1f4244',star:'#ecb964'};L([[-24,0],[24,0],[32,58],[28,62],[-28,62],[-32,58]],c.plum,1,{sx:5,sy:8,sp:22,sa:.4});L([[-8,36],[-2,34],[0,60],[-8,62]],c.furD,10,{sx:3,sy:5,sp:12});L([[4,34],[20,28],[28,36],[16,46],[4,44]],c.furD,13,{sx:3,sy:5,sp:13,sa:.38});Ld(0,14,20,c.furD,5,{sx:4,sy:6,sp:16,sa:.4});Ld(0,14,17,c.fur,6,{sx:3,sy:4,sp:12,sa:.3});L([[-20,6],[-36,14],[-40,10],[-34,-4],[-20,4]],c.furD,30,{sx:3,sy:5,sp:12,sa:.38});L([[18,4],[26,-14],[36,-32],[42,-28],[32,-10],[22,8]],c.furD,32,{sx:3,sy:5,sp:13,sa:.4});L([[34,-30],[38,-30],[46,-58],[42,-58]],c.plum,34,{sx:2,sy:4,sp:8,sa:.38});G.save();G.fillStyle=c.star;G.globalAlpha=.92;G.save();G.translate(44,-62);G.rotate(.3);G.beginPath();for(var k=0;k<5;k++){var a=k*Math.PI*2/5-Math.PI/2;G.lineTo(Math.cos(a)*12,Math.sin(a)*12);a+=Math.PI/5;G.lineTo(Math.cos(a)*6,Math.sin(a)*6);}G.closePath();G.fill();G.restore();G.restore();glow(44,-62,14,14,c.star,.6,8);Ld(0,-8,17,c.furD,50,{sx:4,sy:6,sp:15,sa:.42});Ld(0,-8,14,c.fur,51,{sx:3,sy:4,sp:11,sa:.3});L([[-14,-24],[-6,-22],[-4,-58],[-12,-60]],c.furD,53,{sx:3,sy:5,sp:14,sa:.38});L([[6,-22],[14,-24],[18,-60],[10,-60]],c.furD,56,{sx:3,sy:5,sp:14,sa:.38});Ld(-5,-9,4.5,'#fdfbf2',62,{sx:2,sy:3,sp:6,sa:.32});Ld(-5,-9,3,c.eye,63,{ns:true});Ld(6,-9,4.5,'#fdfbf2',64,{sx:2,sy:3,sp:6,sa:.32});Ld(6,-9,3,c.eye,65,{ns:true});Ld(-38,12,9,c.fur,71,{sx:2,sy:3,sp:7,sa:.3});Ld(40,-26,9,c.fur,72,{sx:2,sy:3,sp:7,sa:.3});Ld(0,-4,2.8,c.nose,66,{sx:1,sy:1,sp:3,sa:.26});G.restore();}},
{name:'B3: BOULDER',id:'bunny-boulder',trait:'Heaviest punch in the kingdom.',color:'#44888a',cardBg:'#d9cfb2',topExt:72,botExt:72,
draw:function(R,cx,cy,sc){var G=R.G,L=R.L,Ld=R.Ld;G.save();G.translate(cx,cy);G.scale(sc,sc);var c={fur:'#e8dec6',furD:'#d9cfb2',dark:'#2a6063',slate:'#44888a',slateL:'#7fb3ae',gold:'#e39a4a',nose:'#f2bf9a',eye:'#1f4244'};L([[-26,22],[-10,20],[-9,54],[-26,56]],c.slate,10,{sx:3,sy:5,sp:14});L([[10,20],[26,22],[26,56],[9,54]],c.slate,11,{sx:3,sy:5,sp:14});L([[-28,52],[-8,50],[-6,64],[-10,68],[-30,66]],c.dark,20,{sx:3,sy:4,sp:12});L([[8,50],[28,52],[30,66],[10,68],[6,64]],c.dark,21,{sx:3,sy:4,sp:12});L([[-28,0],[28,0],[30,24],[-30,24]],c.slate,1,{sx:4,sy:6,sp:19,sa:.44});L([[-28,20],[28,20],[28,28],[-28,28]],c.gold,40,{sx:2,sy:4,sp:10,sa:.38});L([[-28,-2],[-44,10],[-44,20],[-28,22]],c.fur,30,{sx:3,sy:5,sp:13,sa:.38});L([[-22,6],[26,6],[28,16],[-22,16]],c.furD,32,{sx:3,sy:5,sp:12,sa:.4});L([[26,-2],[44,10],[44,20],[26,22]],c.fur,34,{sx:3,sy:5,sp:13,sa:.38});L([[-36,-4],[-16,-12],[-8,-2],[-16,6],[-36,8]],c.slate,50,{sx:3,sy:5,sp:14});L([[16,-12],[36,-4],[36,8],[16,6],[8,-2]],c.slate,52,{sx:3,sy:5,sp:14});Ld(0,-10,18,c.furD,60,{sx:4,sy:6,sp:16,sa:.42});Ld(0,-10,15,c.fur,61,{sx:3,sy:4,sp:12,sa:.3});L([[-14,-26],[-6,-26],[-8,-40],[-16,-40]],c.furD,63,{sx:3,sy:5,sp:11,sa:.4});L([[6,-26],[14,-26],[16,-40],[8,-40]],c.furD,65,{sx:3,sy:5,sp:11,sa:.4});L([[-20,-20],[20,-20],[20,-14],[-20,-14]],c.slate,67,{sx:2,sy:3,sp:8,sa:.38});Ld(-6,-10,4,'#fdfbf2',70,{sx:2,sy:3,sp:6,sa:.32});Ld(-6,-10,2.8,c.eye,71,{ns:true});Ld(6,-10,4,'#fdfbf2',72,{sx:2,sy:3,sp:6,sa:.32});Ld(6,-10,2.8,c.eye,73,{ns:true});Ld(0,-4,3,c.nose,76,{sx:1,sy:1,sp:3,sa:.26});G.restore();}},
{name:'B4: BLAZE',id:'bunny-blaze',trait:'Fire magic. Fire attitude.',color:'#e78f6c',cardBg:'#f2bf9a',topExt:80,botExt:74,
draw:function(R,cx,cy,sc){var G=R.G,L=R.L,Ld=R.Ld,glow=R.glow;G.save();G.translate(cx,cy);G.scale(sc,sc);var c={fur:'#f2bf9a',furD:'#e78f6c',dark:'#1f4244',red:'#d06a4d',orange:'#e39a4a',yellow:'#ecb964',nose:'#e8a09a',eye:'#1f4244'};L([[-20,28],[-6,24],[-4,56],[-20,58]],c.furD,10,{sx:3,sy:5,sp:12});L([[6,24],[20,28],[20,58],[4,56]],c.furD,11,{sx:3,sy:5,sp:12});L([[-22,54],[-4,52],[-2,66],[-6,69],[-24,67]],c.furD,20,{sx:3,sy:4,sp:11});L([[4,52],[22,54],[24,67],[6,69],[2,66]],c.furD,21,{sx:3,sy:4,sp:11});Ld(0,12,21,c.furD,1,{sx:4,sy:6,sp:17,sa:.4});Ld(0,12,18,c.fur,2,{sx:3,sy:4,sp:12,sa:.3});L([[-20,4],[-44,-4],[-48,4],[-38,14],[-20,14]],c.furD,30,{sx:3,sy:5,sp:13,sa:.38});L([[20,4],[44,-4],[48,4],[38,14],[20,14]],c.furD,32,{sx:3,sy:5,sp:13,sa:.38});L([[-44,-2],[-38,-10],[-34,-6],[-38,-14],[-44,-12],[-46,-6]],c.yellow,42,{ns:true});glow(-44,-8,14,12,c.orange,.55,8);L([[44,-2],[38,-10],[34,-6],[38,-14],[44,-12],[46,-6]],c.yellow,45,{ns:true});glow(44,-8,14,12,c.orange,.55,8);Ld(-2,-14,17,c.furD,50,{sx:4,sy:6,sp:15,sa:.42});Ld(-2,-14,14,c.fur,51,{sx:3,sy:4,sp:11,sa:.3});L([[-14,-28],[-6,-28],[-8,-56],[-16,-56]],c.furD,53,{sx:3,sy:5,sp:13,sa:.38});L([[4,-28],[12,-28],[14,-56],[6,-56]],c.furD,57,{sx:3,sy:5,sp:13,sa:.38});L([[-16,-54],[-8,-54],[-10,-66],[-14,-66]],c.red,55,{sx:2,sy:4,sp:9,sa:.38});L([[4,-54],[12,-54],[10,-66],[6,-66]],c.red,59,{sx:2,sy:4,sp:9,sa:.38});glow(-12,-60,5,6,c.orange,.5,5);glow(8,-60,5,6,c.orange,.5,5);Ld(-7,-15,4.5,'#fdfbf2',61,{sx:2,sy:3,sp:6,sa:.32});Ld(-7,-15,3,c.eye,62,{ns:true});Ld(5,-15,4.5,'#fdfbf2',63,{sx:2,sy:3,sp:6,sa:.32});Ld(5,-15,3,c.eye,64,{ns:true});Ld(-1,-9,3,c.nose,67,{sx:1,sy:1,sp:3,sa:.26});G.restore();}},
{name:'B5: DUCHESS',id:'bunny-duchess',trait:'Royal blood. Royal fury.',color:'#3c6b4f',cardBg:'#b7c4a4',topExt:84,botExt:72,
draw:function(R,cx,cy,sc){var G=R.G,L=R.L,Ld=R.Ld,glow=R.glow;G.save();G.translate(cx,cy);G.scale(sc,sc);var c={fur:'#f5eedd',furD:'#e8dec6',dark:'#2a6063',green:'#3c6b4f',greenL:'#57835f',gold:'#e39a4a',gL:'#ecb964',nose:'#e8a09a',eye:'#1f4244',crown:'#e39a4a'};L([[-16,4],[16,4],[18,60],[-18,60]],c.green,1,{sx:5,sy:8,sp:20,sa:.42});L([[-18,56],[18,56],[18,61],[-18,61]],c.gold,3,{sx:2,sy:4,sp:8,sa:.36});L([[-12,58],[-2,56],[0,68],[-4,71],[-14,69]],c.dark,20,{sx:3,sy:4,sp:10});L([[2,56],[12,58],[14,69],[4,71],[0,68]],c.dark,21,{sx:3,sy:4,sp:10});L([[-16,2],[-40,-4],[-44,4],[-36,12],[-16,10]],c.furD,30,{sx:3,sy:5,sp:12,sa:.38});L([[-36,-6],[-44,-8],[-48,0],[-44,8],[-36,10],[-34,2]],c.fur,31,{sx:2,sy:3,sp:8,sa:.34});L([[-38,-4],[-46,-2],[-46,4],[-38,8]],c.gold,80,{sx:2,sy:3,sp:7,sa:.36});L([[-44,-6],[-48,-4],[-48,6],[-44,10]],c.gL,81,{sx:1,sy:2,sp:5,sa:.3});L([[-42,-2],[-48,0],[-48,4],[-42,6]],c.gold,82,{ns:true});L([[16,2],[44,-6],[50,-2],[44,10],[16,10]],c.furD,32,{sx:3,sy:5,sp:13,sa:.4});L([[36,-8],[44,-10],[48,-2],[44,6],[36,8],[34,0]],c.fur,33,{sx:2,sy:3,sp:8,sa:.34});L([[38,-6],[46,-4],[46,2],[38,6]],c.gold,84,{sx:2,sy:3,sp:7,sa:.36});L([[44,-8],[48,-6],[48,4],[44,8]],c.gL,85,{sx:1,sy:2,sp:5,sa:.3});L([[42,-4],[48,-2],[48,2],[42,4]],c.gold,86,{ns:true});Ld(0,14,16,c.furD,5,{sx:4,sy:5,sp:14,sa:.38});Ld(0,-10,16,c.furD,50,{sx:4,sy:6,sp:15,sa:.42});Ld(0,-10,13,c.fur,51,{sx:3,sy:4,sp:11,sa:.3});L([[-12,-26],[-4,-26],[-6,-64],[-14,-64]],c.furD,53,{sx:3,sy:5,sp:13,sa:.38});L([[4,-26],[12,-26],[14,-64],[6,-64]],c.furD,56,{sx:3,sy:5,sp:13,sa:.38});L([[-16,-24],[16,-24],[16,-19],[-16,-19]],c.crown,59,{sx:2,sy:4,sp:10,sa:.4});L([[-16,-24],[-12,-34],[-8,-24]],c.crown,60,{sx:2,sy:4,sp:9,sa:.38});L([[-3,-24],[0,-36],[3,-24]],c.crown,61,{sx:2,sy:4,sp:9,sa:.38});L([[8,-24],[12,-34],[16,-24]],c.crown,62,{sx:2,sy:4,sp:9,sa:.38});Ld(-12,-34,3.5,c.gL,63,{sx:1,sy:2,sp:5,sa:.36});Ld(0,-36,3.5,c.gL,64,{sx:1,sy:2,sp:5,sa:.36});Ld(12,-34,3.5,c.gL,65,{sx:1,sy:2,sp:5,sa:.36});Ld(-5,-11,4,'#fdfbf2',66,{sx:2,sy:3,sp:6,sa:.32});Ld(-5,-11,2.8,c.eye,67,{ns:true});Ld(6,-11,4,'#fdfbf2',68,{sx:2,sy:3,sp:6,sa:.32});Ld(6,-11,2.8,c.eye,69,{ns:true});Ld(0,-5,2.8,c.nose,72,{sx:1,sy:1,sp:3,sa:.26});G.restore();}},
];
