# Research-only pixel measurement; does not modify screenshots.
# Dependencies: numpy, scipy, opencv-python-headless.
import cv2, numpy as np, pathlib, json
from scipy.optimize import least_squares
# Run with the screenshot directory and an output JSON path; originals are read-only.
import sys
manifest=json.loads((pathlib.Path(__file__).parent/'fixtures/vega-capture-image-points.json').read_text())
files=[pathlib.Path(sys.argv[1])/name for name in manifest['files']]
features=[];sift=cv2.SIFT_create(contrastThreshold=.012,edgeThreshold=12)
for f in files:
 im=cv2.imread(str(f));h,w=im.shape[:2];b,g,r=cv2.split(im.astype(float)); gray=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)
 mask=((np.minimum(r,g)>30)&(r<g*1.7)&(g<r*1.7)&(b>g*.55)).astype('uint8')*255
 mask[int(h*.66):]=0
 # Only compact bright components, excluding cockpit and HUD lines.
 n,lab,stats,cents=cv2.connectedComponentsWithStats(mask)
 keep=[i for i in range(1,n) if 2<=stats[i,4]<=600 and max(stats[i,2:4])<45]
 mask=np.isin(lab,keep).astype('uint8')*255
 mask=cv2.dilate(mask,np.ones((9,9),np.uint8))
 kp=[cv2.KeyPoint(float(cents[i,0]),float(cents[i,1]),size,angle) for i in keep for size in [40,80] for angle in [-30,-15,0,15,30]]
 kp,desc=sift.compute(gray,kp)
 features.append((kp,desc))
 print(f.name, len(kp))
pairs=[]
for a,b in [(0,1),(1,4),(5,6)]:
 ka,da=features[a];kb,db=features[b]
 matches=cv2.BFMatcher(crossCheck=True).match(da,db)
 good=[m for m in matches if m.distance<220 and np.linalg.norm(np.array(ka[m.queryIdx].pt)-kb[m.trainIdx].pt)>10]
 pa=np.float64([ka[m.queryIdx].pt for m in good]);pb=np.float64([kb[m.trainIdx].pt for m in good])
 H,mask=cv2.findHomography(pa,pb,cv2.RANSAC,2)
 if H is None:continue
 pa=pa[mask.ravel()==1];pb=pb[mask.ravel()==1]
 # Eliminate duplicate SIFT orientations at the same star.
 _,idx=np.unique(np.round(pa/3).astype(int),axis=0,return_index=True);pa=pa[idx];pb=pb[idx]
 if len(pa)<12:continue
 H,_=cv2.findHomography(pa,pb,0)
 pairs.append({'a':a,'b':b,'pa':pa,'pb':pb,'H':H})
 print('pair',a,b,'matches',len(good),'inliers',len(pa))

for pair in pairs:
 for key in ['H','pa','pb']:pair[key]=pair[key].tolist()
# Positions of Vega and Vega 2 were identified in the 3960x2559 inspection preview.
# Convert these seeds to original coordinates, then centroid only the neutral bright core.
seeds=[[(1195,339),(1983,979)],[(1231,671),(1983,1277)],[(1231,671),(1983,1277)],[(1982,1278),(2868,1629)],[(1191,727),(1982,1277)],[(1982,1277),(2922,1140)],[(1982,1278),(2931,1332)]]
centres=[]
for f,ss in zip(files,seeds):
 im=cv2.imread(str(f));h,w=im.shape[:2];pp=[]
 for sx,sy in ss:
  x,y=int(sx*w/3960),int(sy*h/2559);crop=im[y-14:y+15,x-14:x+15].astype(float)
  v=np.maximum(crop.min(axis=2)-110,0);yy,xx=np.indices(v.shape)
  pp.append([float((xx*v).sum()/v.sum()+x-14),float((yy*v).sum()/v.sum()+y-14)])
 centres.append(pp)
json.dump({'files':[f.name for f in files],'width':w,'height':h,'pairs':pairs,'centresPx':centres},open(sys.argv[2],'w'),indent=2)
