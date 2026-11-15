"""Extract reviewed starfield matches, target arcs, and local-star cores.
Original PNGs are read only. Output is numeric JSON, not altered images.
Manual masks, seeds, and HUD poses are specific to the recorded Altair session.
HUD poses seed correspondence search; final rotations fit image points only.
Requires OpenCV, NumPy, SciPy. See galactic-frame-followup.md for limitations.
"""
import cv2,numpy as np,json,pathlib
from scipy.spatial.transform import Rotation
from scipy.spatial import cKDTree
from scipy.optimize import least_squares
import argparse
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('screenshot_directory',type=pathlib.Path)
parser.add_argument('output',type=pathlib.Path)
args=parser.parse_args()
root=pathlib.Path(__file__).resolve().parent
manifest=json.loads((root/'fixtures/altair-capture-manifest.json').read_text())
files=[args.screenshot_directory/i['filename'] for i in manifest['images']]
indices=range(10)
K=np.array(json.load(open(root/'vega-capture-projection-results.json'))['intrinsics']);Ki=np.linalg.inv(K)
points={}
for index in indices:
 im=cv2.imread(str(files[index]));h,w=im.shape[:2];b,g,r=cv2.split(im.astype(float));yy,xx=np.indices((h,w))
 mask=((np.minimum(r,g)>30)&(r<g*1.7)&(g<r*1.7)&(b>g*.55)).astype('uint8')*255
 mask[int(h*(.54 if index<3 else .65)):]=0
 n,lab,stats,cents=cv2.connectedComponentsWithStats(mask)
 keep=[i for i in range(1,n) if 3<=stats[i,4]<=600 and max(stats[i,2:4])<45]
 points[index]=cents[keep]
 print(index,files[index].name,len(keep))
def pose(h,p,roll=0):
 h,p=np.radians([h,p]);f=np.array([np.sin(h)*np.cos(p),np.cos(h)*np.cos(p),np.sin(p)]);right=np.array([np.cos(h),-np.sin(h),0]);down=-np.cross(right,f)
 return np.array([right,down,f]).T@Rotation.from_euler('z',roll,degrees=True).as_matrix()
# Approximate HUD attitudes only initialize matching; fitted rotation uses image points.
poses={i:pose(h,p) for i,(h,p) in enumerate([(107,6),(107,9),(107,9),(107,15),(108,34),(69,9),(69,11),(69,39),(69,66),(65,79)])}
rng=np.random.default_rng(32);out=[]
pairlist=[(0,1),(1,2),(1,3),(2,3),(3,4),(1,4),(4,5),(5,6),(4,6),(6,7),(4,7),(7,8),(8,9),(7,9)]
for a,b in pairlist:
 pa=points[a];pb=points[b];ra=np.einsum('ij,kj->ik',np.c_[pa,np.ones(len(pa))],Ki);ra/=np.linalg.norm(ra,axis=1)[:,None];rb=np.einsum('ij,kj->ik',np.c_[pb,np.ones(len(pb))],Ki);rb/=np.linalg.norm(rb,axis=1)[:,None]
 R0=poses[b].T@poses[a]
 pred=np.einsum('ij,kj->ik',ra,K@R0);pred=pred[:,:2]/pred[:,2:]
 assert np.isfinite(pred).all()
 dist,idx=cKDTree(pb).query(pred);sel=dist<80;A=ra[sel];B=rb[idx[sel]];PA=pa[sel];PB=pb[idx[sel]]
 best=None
 for _ in range(2500):
  ii=rng.choice(len(A),3,replace=False);U,_,V=np.linalg.svd(B[ii].T@A[ii]);R=U@np.diag([1,1,np.linalg.det(U@V)])@V
  v=np.einsum('ij,kj->ik',A,K@R);err=np.linalg.norm(v[:,:2]/v[:,2:]-PB,axis=1);good=err<3
  if best is None or good.sum()>best[0]:best=(good.sum(),R,good)
 count,R,good=best
 print('PAIR',a,b,'candidate',len(A),'good',count)
 if count<10:continue
 # Recover further correspondences using the measured rotation, not HUD angles.
 predicted=np.einsum('ij,kj->ik',ra,K@R);predicted=predicted[:,:2]/predicted[:,2:]
 distance,nearest=cKDTree(pb).query(predicted);keep=np.flatnonzero(distance<2)
 _,unique=np.unique(nearest[keep],return_index=True);keep=keep[unique]
 if len(keep)>count:
  PA=pa[keep];PB=pb[nearest[keep]];A=ra[keep]
 else:
  PA=PA[good];PB=PB[good];A=A[good]
 print('expanded matches',len(PA))
 def fun(x):
  v=np.einsum('ij,kj->ik',A,K@Rotation.from_rotvec(x).as_matrix())
  return (v[:,:2]/v[:,2:]-PB).ravel()
 fit=least_squares(fun,Rotation.from_matrix(R).as_rotvec(),loss='soft_l1');R=Rotation.from_rotvec(fit.x).as_matrix();err=fun(fit.x).reshape(-1,2)
 print('RMS',np.sqrt(np.mean(np.sum(err**2,axis=1))),'angle',np.degrees(np.linalg.norm(fit.x)))
 out.append({'a':a,'b':b,'pa':PA.tolist(),'pb':PB.tolist(),'R':R.tolist(),'rmsPx':float(np.sqrt(np.mean(np.sum(err**2,axis=1))))})
def fit(index,cx,cy,rx,ry,washed=False):
 im=cv2.imread(str(files[index]));h,w=im.shape[:2];sx=w/1600;sy=h/1034;cx*=sx;cy*=sy;rx*=sx;ry*=sy
 b,g,r=cv2.split(im.astype(float));yy,xx=np.indices((h,w));rho=np.sqrt(((xx-cx)/rx)**2+((yy-cy)/ry)**2)
 mask=(r>140)&(g>50)&(r>g*(1.08 if washed else 1.4))&(g>b*(1.1 if washed else 2))&(rho>.88)&(rho<1.12)&(xx<cx+10*sx)
 pts=np.c_[xx[mask],yy[mask]].astype(float)
 rays=np.einsum('ij,jk->ik',np.c_[pts,np.ones(len(pts))],Ki.T);rays/=np.linalg.norm(rays,axis=1)[:,None]
 _,_,vt=np.linalg.svd(rays-rays.mean(0),full_matrices=False);normal=vt[-1];normal*=np.sign(normal[2]);center=K@normal;center=center[:2]/center[2]
 ellipse=cv2.fitEllipse(pts.astype(np.float32))
 print(index,'count',len(pts),'cone center',center,'ellipse center',ellipse[0],'radiusdeg',np.degrees(np.arccos(np.clip(rays.mean(0)@normal,-1,1))))
 return {'index':index,'pixelPoints':pts.tolist(),'ray':normal.tolist(),'centerPx':center.tolist(),'ellipse':ellipse}

# Reviewed seed ellipses in 1600 x 1034 previews; all fits use original pixels.
seeds=[(0,811,160,42,47),(1,579,608,42,42),(2,481,599,44,43),(4,272,367,54,48),(9,656,164,43,47,True)]
reticles=[fit(*seed) for seed in seeds]
cores=[]
for index,name,px,py in [(0,'Biggs Colony',811,160),(1,'Sol',579,607),(2,'Sirius',481,598),(9,'Altair',656,164)]:
 im=cv2.imread(str(files[index]));h,w=im.shape[:2];x,y=round(px*w/1600),round(py*h/1034)
 patch=im[y-14:y+15,x-14:x+15].astype(float)
 v=np.maximum(patch.min(axis=2)-110,0);yy,xx=np.indices(v.shape)
 assert v.sum()>0
 cores.append({'index':index,'name':name,'pointPx':[(xx*v).sum()/v.sum()+x-14,(yy*v).sum()/v.sum()+y-14]})
args.output.write_text(json.dumps({'registrationPairs':out,'reticles':[{k:r[k] for k in ['index','pixelPoints']} for r in reticles],'visibleCores':cores},indent=2)+'\n')
