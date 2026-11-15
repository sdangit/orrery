"""Extract reviewed orrery marker centres from the original Desktop PNGs.
Manual seeds identify bodies, not calculated orbital predictions. Colocated
station icons obscure three markers; their centres carry a 3-pixel allowance.
"""
import argparse,json,hashlib
from pathlib import Path
import numpy as np
from PIL import Image
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('directory',type=Path);p.add_argument('output',type=Path);args=p.parse_args()
files=[args.directory/f'Screenshot 2026-11-14 at {clock}\u202fPM.png' for clock in ['10.35.47','10.35.57','10.37.44']]
assert len(files)==3
seeds=[[(800,517),(770,606),(647,474),(888,329)],[(800,517),(913,521),(790,595),(534,490),(798,233),(1034,104)],[(1061,554),(971,557),(1098,535),(1274,550),(876,731),(467,749)]]
times=['06:35:47','06:35:57','06:37:44'];names=['Altair','Altair 1','Altair 2','Darkes Hollow','Biggs Colony',"Lowing's Rock"]
images=[]
for i,f in enumerate(files):
 im=np.array(Image.open(f).convert('RGB'),dtype=float);h,w=im.shape[:2];points=[]
 for j,(px,py) in enumerate(seeds[i]):
  x,y=round(px*w/1600),round(py*h/1034);radius=16
  patch=im[y-radius:y+radius+1,x-radius:x+radius+1];r,g,b=patch.transpose(2,0,1);yy,xx=np.indices(r.shape)
  if j==0:weight=np.maximum(b-r,0)*(b>1.2*r)*(r>1.1*g)*(r>50)
  elif j==4:weight=np.maximum(g-r,0)*(g>b*1.1)*(g>100)
  else:weight=np.maximum(np.minimum.reduce([r,g,b])-100,0)*((np.maximum.reduce([r,g,b])-np.minimum.reduce([r,g,b]))<30)
  assert weight.sum()>0
  point=[float((xx*weight).sum()/weight.sum()+x-radius),float((yy*weight).sum()/weight.sum()+y-radius)]
  points.append(dict(bodyId=j,name=names[j],manualSeedPreviewPx=[px,py],pointPx=point,approximateCentroidAllowancePx=3))
 images.append(dict(filename=f.name,sha256=hashlib.sha256(f.read_bytes()).hexdigest(),width=w,height=h,hudTimestamp='2026-11-15T'+times[i]+'Z',points=points))
outline={'imageIndex': 0, 'method': 'Manually digitized from 1600x1034 preview, not used in any camera fit. Approximate 2-preview-pixel selection allowance; compare distance to sampled projected curve, not orbital phase.', 'samples': [{'bodyId': 1, 'previewPoints': [[685, 517], [720, 453], [800, 429], [880, 451], [915, 517], [880, 584], [800, 610], [720, 584]]}, {'bodyId': 2, 'previewPoints': [[635, 517], [800, 391], [965, 517], [800, 652]]}, {'bodyId': 3, 'previewPoints': [[533, 517], [800, 318], [1067, 517], [800, 736]]}]}
args.output.write_text(json.dumps(dict(warning=__doc__,previewSize=[1600,1034],logicalAspectSize=[1600,1000],images=images,independentOrbitOutlineSamples=outline),indent=2)+'\n')
