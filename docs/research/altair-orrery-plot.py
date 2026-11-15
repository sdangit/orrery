"""Create a standalone SVG comparison from frozen measurements and results."""
import json,html
from pathlib import Path
ROOT=Path(__file__).resolve().parent
f=json.loads((ROOT/'fixtures/altair-orrery-image-points.json').read_text())
r=json.loads((ROOT/'altair-orrery-analysis-results.json').read_text())
bounds=[(500,1100,270,770),(400,1200,10,730),(300,1450,330,850)]
parts=['<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1630" viewBox="0 0 1600 1630">','<rect width="1600" height="1630" fill="#f8fafc"/>','<style>text{font-family:Arial,sans-serif;fill:#172033}.small{font-size:16px}.title{font-size:24px;font-weight:bold}</style>', '<text x="35" y="38" class="title">Altair: in-game orrery markers versus calculated positions</text>', '<text x="35" y="67" class="small">Blue rings: measured game markers. Crosses / curves: model after fitting camera only. Units below are original screenshot pixels.</text>', '<text x="35" y="92" class="small">Production uses the actual true-distance scenePosition path. Experimental correction is research-only. No galactic alignment enters these fits.</text>']
for i,row in enumerate(r['rows']):
 for j,m in enumerate(row['models']):
  left=30+j*790;top=125+i*490;pw=750;ph=400
  xmin,xmax,ymin,ymax=bounds[i];scale=min(pw/(xmax-xmin),ph/(ymax-ymin))
  ox=left+(pw-scale*(xmax-xmin))/2;oy=top+55+(ph-scale*(ymax-ymin))/2
  def point(p):
   x,y=p[0]*1600/4112,p[1]*1034/2658
   return ox+(x-xmin)*scale,oy+(y-ymin)*scale
  color='#c2410c' if j==0 else '#15803d'
  title='Production calculation' if j==0 else 'Experimental correction'
  parts.append(f'<text x="{left}" y="{top+20}" class="title">View {i+1} · {title}</text>')
  parts.append(f'<text x="{left}" y="{top+45}" class="small">{row["timestamp"][11:19]} UTC · marker RMS {m["rmsOriginalPx"]:.2f} px</text>')
  parts.append(f'<clipPath id="clip{i}{j}"><rect x="{left}" y="{top+55}" width="{pw}" height="{ph}"/></clipPath>')
  parts.append(f'<g clip-path="url(#clip{i}{j})"><rect x="{left}" y="{top+55}" width="{pw}" height="{ph}" fill="white" stroke="#cbd5e1"/>')
  for orbit in m['projectedOrbits']:
   pts=' '.join(f'{x:.2f},{y:.2f}' for x,y in map(point,orbit['pointsPx']))
   parts.append(f'<polyline points="{pts}" fill="none" stroke="{color}" stroke-width="1.2" opacity="0.45"/>')
  if i==0:
   for sample in f['independentOrbitOutlineSamples']['samples']:
    for x,y in sample['previewPoints']:
     x,y=point([x*4112/1600,y*2658/1034]);parts.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="2.5" fill="#475569"/>')
  for measured,pred in zip(f['images'][i]['points'],m['projectedBodyPx']):
   x,y=point(measured['pointPx']);px,py=point(pred)
   parts.append(f'<path d="M{x:.2f},{y:.2f} L{px:.2f},{py:.2f}" stroke="{color}" opacity="0.6"/>')
   parts.append(f'<circle cx="{x:.2f}" cy="{y:.2f}" r="6" fill="white" stroke="#2563eb" stroke-width="2"/>')
   parts.append(f'<path d="M{px-5:.2f},{py-5:.2f} l10,10 m-10,0 l10,-10" stroke="{color}" stroke-width="2"/>')
   label=['Altair','1','2','Darkes','Biggs',"Lowing's"][measured['bodyId']]
   dx,dy=({0:(0,-28),1:(-20,18),2:(8,-10)}.get(measured['bodyId'],(9,-9)) if i==2 else {0:(5,-18),1:(10,-10),2:(0,22)}.get(measured['bodyId'],(9,-9)) if i==1 else (9,-9))
   parts.append(f'<text x="{x+dx:.2f}" y="{y+dy:.2f}" class="small">{html.escape(label)}</text>')
  parts.append('</g>')
parts.append('<text x="35" y="1610" class="small">View 1 grey points: manually sampled game orbit outlines, excluded from all fits. Two full-system views and marker holdouts constrain the comparison.</text></svg>')
(ROOT/'altair-orrery-comparison.svg').write_text('\n'.join(parts)+'\n')
