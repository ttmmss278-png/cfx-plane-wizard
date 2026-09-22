import {nozzleColor} from '../roundness-deviation/chart.js';
import {validateRows} from './core.js';
const label = n => Number(n.toPrecision(7)).toString();
const stepFor = span => { const raw=span/6, power=10**Math.floor(Math.log10(raw)); return ([1,2,2.5,5,10].find(n=>n>=raw/power)||10)*power; };
function marker(n,x,y,color,title='') {
  const attrs=`class="${title===''?'legend-marker':'curve-point'}" data-value="${title}" fill="${color}" stroke="${color}"`;
  const inside=`<title>${title}</title>`;
  if (n%6===1) return `<rect x="${x-5}" y="${y-5}" width="10" height="10" ${attrs}>${inside}</rect>`;
  if (n%6===3 || n%6===4) {const sign=n%6===3?1:-1;return `<polygon points="${x},${y-7*sign} ${x-6},${y+5*sign} ${x+6},${y+5*sign}" ${attrs}>${inside}</polygon>`;}
  if (n%6===5) return `<polygon points="${x},${y-7} ${x-5},${y} ${x},${y+7} ${x+5},${y}" ${attrs}>${inside}</polygon>`;
  return `<circle cx="${x}" cy="${y}" r="5.5" ${attrs}>${inside}</circle>`;
}

export function buildMetricChart(input,kind,visible=null) {
  const rows = validateRows(input,kind).filter(row=>visible==null || visible.includes(row.nozzle));
  if (!rows.length) return '';
  const nozzles=[...new Set(rows.map(row=>row.nozzle))].sort((a,b)=>a-b);
  let min=Infinity,max=-Infinity,maxX=0;
  rows.forEach(row=>{min=Math.min(min,row.value);max=Math.max(max,row.value);maxX=Math.max(maxX,row.section);});
  const offset=kind==='offset', span=offset?Math.max(max,0.01):Math.max(max-min,0.002);
  const yStep=stepFor(span*1.2);
  const yMin=offset?0:Math.max(0,Math.floor((min-span*0.12)/yStep)*yStep);
  const yMax=offset?Math.max(yStep,Math.ceil((max+span*0.1)/yStep)*yStep):Math.min(1,Math.ceil((max+span*0.12)/yStep)*yStep);
  const xStep=stepFor(maxX||1), xMax=(maxX||1)+xStep*0.3;
  const w=1120,h=708+Math.ceil(nozzles.length/6)*32,px=126,py=60+Math.ceil(nozzles.length/6)*32,pw=950,ph=h-py-90;
  const x=n=>px+n/xMax*pw,y=n=>py+ph-(n-yMin)/(yMax-yMin)*ph;
  const title=offset?'射流偏移度 A (%)':'速度均匀性';
  const svg=[`<svg xmlns="http://www.w3.org/2000/svg" class="metric-chart" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}随截面变化"><title>${title}随截面变化</title><rect width="${w}" height="${h}" fill="white"/><g fill="#171717" font-family="Times New Roman, Microsoft YaHei, serif" font-size="23">`];
  nozzles.forEach((n,i)=>{const lx=px+i%6*155,ly=32+Math.floor(i/6)*32,c=nozzleColor(n);svg.push(`<line x1="${lx}" y1="${ly}" x2="${lx+44}" y2="${ly}" stroke="${c}" stroke-width="2"/>${marker(n,lx+22,ly,c)}<text x="${lx+52}" y="${ly+7}">PZ${n}</text>`);});
  for (let i=0;i<=Math.floor(xMax/xStep*2);i++) {
    const value=i*xStep/2,xx=x(value),major=i%2===0;
    svg.push(`<line x1="${xx}" y1="${py}" x2="${xx}" y2="${py+ph}" stroke="${major?'#8b8b8b':'#c5c5c5'}" stroke-width="0.8" ${major?'':'stroke-dasharray="2 4"'}/>`);
    if(major)svg.push(`<text x="${xx}" y="${py+ph+34}" text-anchor="middle">${label(value)}</text>`);
  }
  for (let i=0;i<=Math.round((yMax-yMin)/yStep*2);i++) {
    const value=yMin+i*yStep/2,yy=y(value),major=i%2===0;
    svg.push(`<line x1="${px}" y1="${yy}" x2="${px+pw}" y2="${yy}" stroke="${major?'#8b8b8b':'#c5c5c5'}" stroke-width="0.8" ${major?'':'stroke-dasharray="2 4"'}/>`);
    if(major)svg.push(`<text x="${px-16}" y="${yy+8}" text-anchor="end">${label(value)}</text>`);
  }
  nozzles.forEach(n=>{const points=rows.filter(row=>row.nozzle===n),c=nozzleColor(n);svg.push(`<g class="chart-series" data-nozzle="${n}"><polyline points="${points.map(row=>`${x(row.section)},${y(row.value)}`).join(' ')}" fill="none" stroke="${c}" stroke-width="2.5"/>`);points.forEach(row=>svg.push(marker(n,x(row.section),y(row.value),c,String(row.value))));svg.push('</g>');});
  svg.push(`<rect x="${px}" y="${py}" width="${pw}" height="${ph}" fill="none" stroke="#171717" stroke-width="2"/><text x="${px+pw/2}" y="${h-20}" text-anchor="middle" font-size="30">X/D</text><text transform="translate(32 ${py+ph/2}) rotate(-90)" text-anchor="middle" font-size="26">${title}</text></g></svg>`);
  return svg.join('');
}
