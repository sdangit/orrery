# Research only. Reproduce camera fit and angular measurements from frozen pixel data.
# Dependencies: numpy, scipy. Run: python docs/research/vega-capture-projection.py
import json, numpy as np
from pathlib import Path
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation
r=json.loads((Path(__file__).parent/'fixtures/vega-capture-image-points.json').read_text()); pairs=r['pairs']
K0=np.array([[2160,0,2056],[0,2234,1329],[0,0,1.]])
x0=[np.log(2160),np.log(2234),2056,1329]
for p in pairs:
 R=np.linalg.inv(K0)@np.array(p['H'])@K0;u,s,vt=np.linalg.svd(R)
 x0.extend(Rotation.from_matrix(u@vt).as_rotvec())
 p['pa']=np.array(p['pa']);p['pb']=np.array(p['pb'])
def getK(x):
 return np.array([[np.exp(x[0]),0,x[2]],[0,np.exp(x[1]),x[3]],[0,0,1.]])
def errors(x,i):
 K=getK(x);R=Rotation.from_rotvec(x[4+i*3:7+i*3]).as_matrix();p=pairs[i]
 z=np.c_[p['pa'],np.ones(len(p['pa']))]@(K@R@np.linalg.inv(K)).T
 return z[:,:2]/z[:,2:]-p['pb']
def fun(x):return np.concatenate([errors(x,i)[::2].ravel() for i in range(len(pairs))])
opt=least_squares(fun,x0,loss='soft_l1',f_scale=.5,max_nfev=1000);K=getK(opt.x)
assert opt.success and np.isfinite(K).all(), 'Projection fit failed'
reports=[]
for i,p in enumerate(pairs):
 e=errors(opt.x,i);item={'a':p['a'],'b':p['b'],'count':len(e),'trainingRmsPx':float(np.sqrt(np.mean(np.sum(e[::2]**2,axis=1)))),'heldOutRmsPx':float(np.sqrt(np.mean(np.sum(e[1::2]**2,axis=1))))};reports.append(item)
centres=[]
for index,pp in enumerate(r['centresPx']):
 rays=np.c_[pp,np.ones(2)]@np.linalg.inv(K).T;rays/=np.linalg.norm(rays,axis=1)[:,None]
 angle=float(np.degrees(np.arccos(np.clip(rays[0]@rays[1],-1,1))))
 item={'index':index,'centresPx':pp,'separationDeg':angle};centres.append(item)
out={'method':'Camera intrinsics and per-pair rotations fitted to star correspondences; alternating matches held out. No orbital-model directions used.',
 'intrinsics':K.tolist(),'fitPairs':reports,'measurements':centres,'warnings':['Centres selected using manually identified local-star regions.','Pure-rotation pinhole model; model-systematic errors not included in residuals.','Nominal FOV alone does not match empirical screenshot projection.']}
print(json.dumps(out,indent=2))
