"use strict";(()=>{var qu=0,Tl=1,Zu=2;var Al=1,Ca=2,di=3,Zn=0,Vt=1,kt=2,Ui=0,ds=1,jn=2,wl=3,Rl=4,Ku=5,qi=100,Ju=101,$u=102,ju=103,Qu=104,ed=200,td=201,nd=202,id=203,ha=204,ua=205,sd=206,rd=207,od=208,ad=209,cd=210,ld=211,hd=212,ud=213,dd=214,Ia=0,Pa=1,La=2,fs=3,Da=4,Ua=5,Na=6,Fa=7,Cl=0,fd=1,pd=2,Ni=0,md=1,gd=2,_d=3,Ba=4,xd=5,yd=6,vd=7,pl="attached",Md="detached",Il=300,Is=301,Ps=302,Ls=303,Oa=304,yo=306,bt=1e3,Mn=1001,cr=1002,ln=1003,za=1004;var Ds=1005;var Nt=1006,mr=1007;var Bn=1008;var fi=1009,Pl=1010,Ll=1011,gr=1012,Ha=1013,es=1014,gn=1015,Qn=1016,ka=1017,Ga=1018,Us=1020,Dl=35902,Ul=1021,Nl=1022,Pn=1023,Fl=1024,Bl=1025,us=1026,ps=1027,Va=1028,Wa=1029,Ol=1030,Xa=1031;var Ya=1033,vo=33776,Mo=33777,bo=33778,So=33779,qa=35840,Za=35841,Ka=35842,Ja=35843,$a=36196,ja=37492,Qa=37496,ec=37808,tc=37809,nc=37810,ic=37811,sc=37812,rc=37813,oc=37814,ac=37815,cc=37816,lc=37817,hc=37818,uc=37819,dc=37820,fc=37821,Eo=36492,pc=36494,mc=36495,zl=36283,gc=36284,_c=36285,xc=36286;var ms=2300,gs=2301,la=2302,ml=2400,gl=2401,_l=2402,bd=2500;var Hl=0,To=1,_r=2,Sd=3200,Ed=3201;var kl=0,Td=1,Fi="",ct="srgb",Jt="srgb-linear",Xr="linear",At="srgb";var hs=7680;var xl=519,Ad=512,wd=513,Rd=514,Gl=515,Cd=516,Id=517,Pd=518,Ld=519,da=35044;var Vl="300 es",oi=2e3,Yr=2001;var Ri=class{addEventListener(e,t){this._listeners===void 0&&(this._listeners={});let n=this._listeners;n[e]===void 0&&(n[e]=[]),n[e].indexOf(t)===-1&&n[e].push(t)}hasEventListener(e,t){let n=this._listeners;return n===void 0?!1:n[e]!==void 0&&n[e].indexOf(t)!==-1}removeEventListener(e,t){let n=this._listeners;if(n===void 0)return;let i=n[e];if(i!==void 0){let r=i.indexOf(t);r!==-1&&i.splice(r,1)}}dispatchEvent(e){let t=this._listeners;if(t===void 0)return;let n=t[e.type];if(n!==void 0){e.target=this;let i=n.slice(0);for(let r=0,o=i.length;r<o;r++)i[r].call(this,e);e.target=null}}},dn=["00","01","02","03","04","05","06","07","08","09","0a","0b","0c","0d","0e","0f","10","11","12","13","14","15","16","17","18","19","1a","1b","1c","1d","1e","1f","20","21","22","23","24","25","26","27","28","29","2a","2b","2c","2d","2e","2f","30","31","32","33","34","35","36","37","38","39","3a","3b","3c","3d","3e","3f","40","41","42","43","44","45","46","47","48","49","4a","4b","4c","4d","4e","4f","50","51","52","53","54","55","56","57","58","59","5a","5b","5c","5d","5e","5f","60","61","62","63","64","65","66","67","68","69","6a","6b","6c","6d","6e","6f","70","71","72","73","74","75","76","77","78","79","7a","7b","7c","7d","7e","7f","80","81","82","83","84","85","86","87","88","89","8a","8b","8c","8d","8e","8f","90","91","92","93","94","95","96","97","98","99","9a","9b","9c","9d","9e","9f","a0","a1","a2","a3","a4","a5","a6","a7","a8","a9","aa","ab","ac","ad","ae","af","b0","b1","b2","b3","b4","b5","b6","b7","b8","b9","ba","bb","bc","bd","be","bf","c0","c1","c2","c3","c4","c5","c6","c7","c8","c9","ca","cb","cc","cd","ce","cf","d0","d1","d2","d3","d4","d5","d6","d7","d8","d9","da","db","dc","dd","de","df","e0","e1","e2","e3","e4","e5","e6","e7","e8","e9","ea","eb","ec","ed","ee","ef","f0","f1","f2","f3","f4","f5","f6","f7","f8","f9","fa","fb","fc","fd","fe","ff"],lu=1234567,Vr=Math.PI/180,_s=180/Math.PI;function qn(){let s=Math.random()*4294967295|0,e=Math.random()*4294967295|0,t=Math.random()*4294967295|0,n=Math.random()*4294967295|0;return(dn[s&255]+dn[s>>8&255]+dn[s>>16&255]+dn[s>>24&255]+"-"+dn[e&255]+dn[e>>8&255]+"-"+dn[e>>16&15|64]+dn[e>>24&255]+"-"+dn[t&63|128]+dn[t>>8&255]+"-"+dn[t>>16&255]+dn[t>>24&255]+dn[n&255]+dn[n>>8&255]+dn[n>>16&255]+dn[n>>24&255]).toLowerCase()}function ht(s,e,t){return Math.max(e,Math.min(t,s))}function Wl(s,e){return(s%e+e)%e}function Ep(s,e,t,n,i){return n+(s-e)*(i-n)/(t-e)}function Tp(s,e,t){return s!==e?(t-s)/(e-s):0}function Wr(s,e,t){return(1-t)*s+t*e}function Ap(s,e,t,n){return Wr(s,e,1-Math.exp(-t*n))}function wp(s,e=1){return e-Math.abs(Wl(s,e*2)-e)}function Rp(s,e,t){return s<=e?0:s>=t?1:(s=(s-e)/(t-e),s*s*(3-2*s))}function Cp(s,e,t){return s<=e?0:s>=t?1:(s=(s-e)/(t-e),s*s*s*(s*(s*6-15)+10))}function Ip(s,e){return s+Math.floor(Math.random()*(e-s+1))}function Pp(s,e){return s+Math.random()*(e-s)}function Lp(s){return s*(.5-Math.random())}function Dp(s){s!==void 0&&(lu=s);let e=lu+=1831565813;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}function Up(s){return s*Vr}function Np(s){return s*_s}function Fp(s){return(s&s-1)===0&&s!==0}function Bp(s){return Math.pow(2,Math.ceil(Math.log(s)/Math.LN2))}function Op(s){return Math.pow(2,Math.floor(Math.log(s)/Math.LN2))}function zp(s,e,t,n,i){let r=Math.cos,o=Math.sin,a=r(t/2),c=o(t/2),l=r((e+n)/2),h=o((e+n)/2),u=r((e-n)/2),d=o((e-n)/2),p=r((n-e)/2),g=o((n-e)/2);switch(i){case"XYX":s.set(a*h,c*u,c*d,a*l);break;case"YZY":s.set(c*d,a*h,c*u,a*l);break;case"ZXZ":s.set(c*u,c*d,a*h,a*l);break;case"XZX":s.set(a*h,c*g,c*p,a*l);break;case"YXY":s.set(c*p,a*h,c*g,a*l);break;case"ZYZ":s.set(c*g,c*p,a*h,a*l);break;default:console.warn("THREE.MathUtils: .setQuaternionFromProperEuler() encountered an unknown order: "+i)}}function Yn(s,e){switch(e.constructor){case Float32Array:return s;case Uint32Array:return s/4294967295;case Uint16Array:return s/65535;case Uint8Array:return s/255;case Int32Array:return Math.max(s/2147483647,-1);case Int16Array:return Math.max(s/32767,-1);case Int8Array:return Math.max(s/127,-1);default:throw new Error("Invalid component type.")}}function Tt(s,e){switch(e.constructor){case Float32Array:return s;case Uint32Array:return Math.round(s*4294967295);case Uint16Array:return Math.round(s*65535);case Uint8Array:return Math.round(s*255);case Int32Array:return Math.round(s*2147483647);case Int16Array:return Math.round(s*32767);case Int8Array:return Math.round(s*127);default:throw new Error("Invalid component type.")}}var Xl={DEG2RAD:Vr,RAD2DEG:_s,generateUUID:qn,clamp:ht,euclideanModulo:Wl,mapLinear:Ep,inverseLerp:Tp,lerp:Wr,damp:Ap,pingpong:wp,smoothstep:Rp,smootherstep:Cp,randInt:Ip,randFloat:Pp,randFloatSpread:Lp,seededRandom:Dp,degToRad:Up,radToDeg:Np,isPowerOfTwo:Fp,ceilPowerOfTwo:Bp,floorPowerOfTwo:Op,setQuaternionFromProperEuler:zp,normalize:Tt,denormalize:Yn},ke=class s{constructor(e=0,t=0){s.prototype.isVector2=!0,this.x=e,this.y=t}get width(){return this.x}set width(e){this.x=e}get height(){return this.y}set height(e){this.y=e}set(e,t){return this.x=e,this.y=t,this}setScalar(e){return this.x=e,this.y=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y)}copy(e){return this.x=e.x,this.y=e.y,this}add(e){return this.x+=e.x,this.y+=e.y,this}addScalar(e){return this.x+=e,this.y+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this}subScalar(e){return this.x-=e,this.y-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this}multiply(e){return this.x*=e.x,this.y*=e.y,this}multiplyScalar(e){return this.x*=e,this.y*=e,this}divide(e){return this.x/=e.x,this.y/=e.y,this}divideScalar(e){return this.multiplyScalar(1/e)}applyMatrix3(e){let t=this.x,n=this.y,i=e.elements;return this.x=i[0]*t+i[3]*n+i[6],this.y=i[1]*t+i[4]*n+i[7],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this}clamp(e,t){return this.x=ht(this.x,e.x,t.x),this.y=ht(this.y,e.y,t.y),this}clampScalar(e,t){return this.x=ht(this.x,e,t),this.y=ht(this.y,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(ht(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this}negate(){return this.x=-this.x,this.y=-this.y,this}dot(e){return this.x*e.x+this.y*e.y}cross(e){return this.x*e.y-this.y*e.x}lengthSq(){return this.x*this.x+this.y*this.y}length(){return Math.sqrt(this.x*this.x+this.y*this.y)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)}normalize(){return this.divideScalar(this.length()||1)}angle(){return Math.atan2(-this.y,-this.x)+Math.PI}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(ht(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y;return t*t+n*n}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this}equals(e){return e.x===this.x&&e.y===this.y}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this}rotateAround(e,t){let n=Math.cos(t),i=Math.sin(t),r=this.x-e.x,o=this.y-e.y;return this.x=r*n-o*i+e.x,this.y=r*i+o*n+e.y,this}random(){return this.x=Math.random(),this.y=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y}},Qe=class s{constructor(e,t,n,i,r,o,a,c,l){s.prototype.isMatrix3=!0,this.elements=[1,0,0,0,1,0,0,0,1],e!==void 0&&this.set(e,t,n,i,r,o,a,c,l)}set(e,t,n,i,r,o,a,c,l){let h=this.elements;return h[0]=e,h[1]=i,h[2]=a,h[3]=t,h[4]=r,h[5]=c,h[6]=n,h[7]=o,h[8]=l,this}identity(){return this.set(1,0,0,0,1,0,0,0,1),this}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],this}extractBasis(e,t,n){return e.setFromMatrix3Column(this,0),t.setFromMatrix3Column(this,1),n.setFromMatrix3Column(this,2),this}setFromMatrix4(e){let t=e.elements;return this.set(t[0],t[4],t[8],t[1],t[5],t[9],t[2],t[6],t[10]),this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,i=t.elements,r=this.elements,o=n[0],a=n[3],c=n[6],l=n[1],h=n[4],u=n[7],d=n[2],p=n[5],g=n[8],_=i[0],m=i[3],f=i[6],v=i[1],S=i[4],x=i[7],P=i[2],T=i[5],w=i[8];return r[0]=o*_+a*v+c*P,r[3]=o*m+a*S+c*T,r[6]=o*f+a*x+c*w,r[1]=l*_+h*v+u*P,r[4]=l*m+h*S+u*T,r[7]=l*f+h*x+u*w,r[2]=d*_+p*v+g*P,r[5]=d*m+p*S+g*T,r[8]=d*f+p*x+g*w,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[3]*=e,t[6]*=e,t[1]*=e,t[4]*=e,t[7]*=e,t[2]*=e,t[5]*=e,t[8]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],o=e[4],a=e[5],c=e[6],l=e[7],h=e[8];return t*o*h-t*a*l-n*r*h+n*a*c+i*r*l-i*o*c}invert(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],o=e[4],a=e[5],c=e[6],l=e[7],h=e[8],u=h*o-a*l,d=a*c-h*r,p=l*r-o*c,g=t*u+n*d+i*p;if(g===0)return this.set(0,0,0,0,0,0,0,0,0);let _=1/g;return e[0]=u*_,e[1]=(i*l-h*n)*_,e[2]=(a*n-i*o)*_,e[3]=d*_,e[4]=(h*t-i*c)*_,e[5]=(i*r-a*t)*_,e[6]=p*_,e[7]=(n*c-l*t)*_,e[8]=(o*t-n*r)*_,this}transpose(){let e,t=this.elements;return e=t[1],t[1]=t[3],t[3]=e,e=t[2],t[2]=t[6],t[6]=e,e=t[5],t[5]=t[7],t[7]=e,this}getNormalMatrix(e){return this.setFromMatrix4(e).invert().transpose()}transposeIntoArray(e){let t=this.elements;return e[0]=t[0],e[1]=t[3],e[2]=t[6],e[3]=t[1],e[4]=t[4],e[5]=t[7],e[6]=t[2],e[7]=t[5],e[8]=t[8],this}setUvTransform(e,t,n,i,r,o,a){let c=Math.cos(r),l=Math.sin(r);return this.set(n*c,n*l,-n*(c*o+l*a)+o+e,-i*l,i*c,-i*(-l*o+c*a)+a+t,0,0,1),this}scale(e,t){return this.premultiply(Gc.makeScale(e,t)),this}rotate(e){return this.premultiply(Gc.makeRotation(-e)),this}translate(e,t){return this.premultiply(Gc.makeTranslation(e,t)),this}makeTranslation(e,t){return e.isVector2?this.set(1,0,e.x,0,1,e.y,0,0,1):this.set(1,0,e,0,1,t,0,0,1),this}makeRotation(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,n,t,0,0,0,1),this}makeScale(e,t){return this.set(e,0,0,0,t,0,0,0,1),this}equals(e){let t=this.elements,n=e.elements;for(let i=0;i<9;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<9;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e}clone(){return new this.constructor().fromArray(this.elements)}},Gc=new Qe;function Yl(s){for(let e=s.length-1;e>=0;--e)if(s[e]>=65535)return!0;return!1}function lr(s){return document.createElementNS("http://www.w3.org/1999/xhtml",s)}function Dd(){let s=lr("canvas");return s.style.display="block",s}var hu={};function ts(s){s in hu||(hu[s]=!0,console.warn(s))}function Ud(s,e,t){return new Promise(function(n,i){function r(){switch(s.clientWaitSync(e,s.SYNC_FLUSH_COMMANDS_BIT,0)){case s.WAIT_FAILED:i();break;case s.TIMEOUT_EXPIRED:setTimeout(r,t);break;default:n()}}setTimeout(r,t)})}function Nd(s){let e=s.elements;e[2]=.5*e[2]+.5*e[3],e[6]=.5*e[6]+.5*e[7],e[10]=.5*e[10]+.5*e[11],e[14]=.5*e[14]+.5*e[15]}function Fd(s){let e=s.elements;e[11]===-1?(e[10]=-e[10]-1,e[14]=-e[14]):(e[10]=-e[10],e[14]=-e[14]+1)}var uu=new Qe().set(.4123908,.3575843,.1804808,.212639,.7151687,.0721923,.0193308,.1191948,.9505322),du=new Qe().set(3.2409699,-1.5373832,-.4986108,-.9692436,1.8759675,.0415551,.0556301,-.203977,1.0569715);function Hp(){let s={enabled:!0,workingColorSpace:Jt,spaces:{},convert:function(i,r,o){return this.enabled===!1||r===o||!r||!o||(this.spaces[r].transfer===At&&(i.r=wi(i.r),i.g=wi(i.g),i.b=wi(i.b)),this.spaces[r].primaries!==this.spaces[o].primaries&&(i.applyMatrix3(this.spaces[r].toXYZ),i.applyMatrix3(this.spaces[o].fromXYZ)),this.spaces[o].transfer===At&&(i.r=ar(i.r),i.g=ar(i.g),i.b=ar(i.b))),i},fromWorkingColorSpace:function(i,r){return this.convert(i,this.workingColorSpace,r)},toWorkingColorSpace:function(i,r){return this.convert(i,r,this.workingColorSpace)},getPrimaries:function(i){return this.spaces[i].primaries},getTransfer:function(i){return i===Fi?Xr:this.spaces[i].transfer},getLuminanceCoefficients:function(i,r=this.workingColorSpace){return i.fromArray(this.spaces[r].luminanceCoefficients)},define:function(i){Object.assign(this.spaces,i)},_getMatrix:function(i,r,o){return i.copy(this.spaces[r].toXYZ).multiply(this.spaces[o].fromXYZ)},_getDrawingBufferColorSpace:function(i){return this.spaces[i].outputColorSpaceConfig.drawingBufferColorSpace},_getUnpackColorSpace:function(i=this.workingColorSpace){return this.spaces[i].workingColorSpaceConfig.unpackColorSpace}},e=[.64,.33,.3,.6,.15,.06],t=[.2126,.7152,.0722],n=[.3127,.329];return s.define({[Jt]:{primaries:e,whitePoint:n,transfer:Xr,toXYZ:uu,fromXYZ:du,luminanceCoefficients:t,workingColorSpaceConfig:{unpackColorSpace:ct},outputColorSpaceConfig:{drawingBufferColorSpace:ct}},[ct]:{primaries:e,whitePoint:n,transfer:At,toXYZ:uu,fromXYZ:du,luminanceCoefficients:t,outputColorSpaceConfig:{drawingBufferColorSpace:ct}}}),s}var ft=Hp();function wi(s){return s<.04045?s*.0773993808:Math.pow(s*.9478672986+.0521327014,2.4)}function ar(s){return s<.0031308?s*12.92:1.055*Math.pow(s,.41666)-.055}var Ws,fa=class{static getDataURL(e){if(/^data:/i.test(e.src)||typeof HTMLCanvasElement>"u")return e.src;let t;if(e instanceof HTMLCanvasElement)t=e;else{Ws===void 0&&(Ws=lr("canvas")),Ws.width=e.width,Ws.height=e.height;let n=Ws.getContext("2d");e instanceof ImageData?n.putImageData(e,0,0):n.drawImage(e,0,0,e.width,e.height),t=Ws}return t.toDataURL("image/png")}static sRGBToLinear(e){if(typeof HTMLImageElement<"u"&&e instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&e instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&e instanceof ImageBitmap){let t=lr("canvas");t.width=e.width,t.height=e.height;let n=t.getContext("2d");n.drawImage(e,0,0,e.width,e.height);let i=n.getImageData(0,0,e.width,e.height),r=i.data;for(let o=0;o<r.length;o++)r[o]=wi(r[o]/255)*255;return n.putImageData(i,0,0),t}else if(e.data){let t=e.data.slice(0);for(let n=0;n<t.length;n++)t instanceof Uint8Array||t instanceof Uint8ClampedArray?t[n]=Math.floor(wi(t[n]/255)*255):t[n]=wi(t[n]);return{data:t,width:e.width,height:e.height}}else return console.warn("THREE.ImageUtils.sRGBToLinear(): Unsupported image type. No color space conversion applied."),e}},kp=0,hr=class{constructor(e=null){this.isSource=!0,Object.defineProperty(this,"id",{value:kp++}),this.uuid=qn(),this.data=e,this.dataReady=!0,this.version=0}set needsUpdate(e){e===!0&&this.version++}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.images[this.uuid]!==void 0)return e.images[this.uuid];let n={uuid:this.uuid,url:""},i=this.data;if(i!==null){let r;if(Array.isArray(i)){r=[];for(let o=0,a=i.length;o<a;o++)i[o].isDataTexture?r.push(Vc(i[o].image)):r.push(Vc(i[o]))}else r=Vc(i);n.url=r}return t||(e.images[this.uuid]=n),n}};function Vc(s){return typeof HTMLImageElement<"u"&&s instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&s instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&s instanceof ImageBitmap?fa.getDataURL(s):s.data?{data:Array.from(s.data),width:s.width,height:s.height,type:s.data.constructor.name}:(console.warn("THREE.Texture: Unable to serialize Texture."),{})}var Gp=0,$t=class s extends Ri{constructor(e=s.DEFAULT_IMAGE,t=s.DEFAULT_MAPPING,n=Mn,i=Mn,r=Nt,o=Bn,a=Pn,c=fi,l=s.DEFAULT_ANISOTROPY,h=Fi){super(),this.isTexture=!0,Object.defineProperty(this,"id",{value:Gp++}),this.uuid=qn(),this.name="",this.source=new hr(e),this.mipmaps=[],this.mapping=t,this.channel=0,this.wrapS=n,this.wrapT=i,this.magFilter=r,this.minFilter=o,this.anisotropy=l,this.format=a,this.internalFormat=null,this.type=c,this.offset=new ke(0,0),this.repeat=new ke(1,1),this.center=new ke(0,0),this.rotation=0,this.matrixAutoUpdate=!0,this.matrix=new Qe,this.generateMipmaps=!0,this.premultiplyAlpha=!1,this.flipY=!0,this.unpackAlignment=4,this.colorSpace=h,this.userData={},this.version=0,this.onUpdate=null,this.renderTarget=null,this.isRenderTargetTexture=!1,this.pmremVersion=0}get image(){return this.source.data}set image(e=null){this.source.data=e}updateMatrix(){this.matrix.setUvTransform(this.offset.x,this.offset.y,this.repeat.x,this.repeat.y,this.rotation,this.center.x,this.center.y)}clone(){return new this.constructor().copy(this)}copy(e){return this.name=e.name,this.source=e.source,this.mipmaps=e.mipmaps.slice(0),this.mapping=e.mapping,this.channel=e.channel,this.wrapS=e.wrapS,this.wrapT=e.wrapT,this.magFilter=e.magFilter,this.minFilter=e.minFilter,this.anisotropy=e.anisotropy,this.format=e.format,this.internalFormat=e.internalFormat,this.type=e.type,this.offset.copy(e.offset),this.repeat.copy(e.repeat),this.center.copy(e.center),this.rotation=e.rotation,this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrix.copy(e.matrix),this.generateMipmaps=e.generateMipmaps,this.premultiplyAlpha=e.premultiplyAlpha,this.flipY=e.flipY,this.unpackAlignment=e.unpackAlignment,this.colorSpace=e.colorSpace,this.renderTarget=e.renderTarget,this.isRenderTargetTexture=e.isRenderTargetTexture,this.userData=JSON.parse(JSON.stringify(e.userData)),this.needsUpdate=!0,this}toJSON(e){let t=e===void 0||typeof e=="string";if(!t&&e.textures[this.uuid]!==void 0)return e.textures[this.uuid];let n={metadata:{version:4.6,type:"Texture",generator:"Texture.toJSON"},uuid:this.uuid,name:this.name,image:this.source.toJSON(e).uuid,mapping:this.mapping,channel:this.channel,repeat:[this.repeat.x,this.repeat.y],offset:[this.offset.x,this.offset.y],center:[this.center.x,this.center.y],rotation:this.rotation,wrap:[this.wrapS,this.wrapT],format:this.format,internalFormat:this.internalFormat,type:this.type,colorSpace:this.colorSpace,minFilter:this.minFilter,magFilter:this.magFilter,anisotropy:this.anisotropy,flipY:this.flipY,generateMipmaps:this.generateMipmaps,premultiplyAlpha:this.premultiplyAlpha,unpackAlignment:this.unpackAlignment};return Object.keys(this.userData).length>0&&(n.userData=this.userData),t||(e.textures[this.uuid]=n),n}dispose(){this.dispatchEvent({type:"dispose"})}transformUv(e){if(this.mapping!==Il)return e;if(e.applyMatrix3(this.matrix),e.x<0||e.x>1)switch(this.wrapS){case bt:e.x=e.x-Math.floor(e.x);break;case Mn:e.x=e.x<0?0:1;break;case cr:Math.abs(Math.floor(e.x)%2)===1?e.x=Math.ceil(e.x)-e.x:e.x=e.x-Math.floor(e.x);break}if(e.y<0||e.y>1)switch(this.wrapT){case bt:e.y=e.y-Math.floor(e.y);break;case Mn:e.y=e.y<0?0:1;break;case cr:Math.abs(Math.floor(e.y)%2)===1?e.y=Math.ceil(e.y)-e.y:e.y=e.y-Math.floor(e.y);break}return this.flipY&&(e.y=1-e.y),e}set needsUpdate(e){e===!0&&(this.version++,this.source.needsUpdate=!0)}set needsPMREMUpdate(e){e===!0&&this.pmremVersion++}};$t.DEFAULT_IMAGE=null;$t.DEFAULT_MAPPING=Il;$t.DEFAULT_ANISOTROPY=1;var _t=class s{constructor(e=0,t=0,n=0,i=1){s.prototype.isVector4=!0,this.x=e,this.y=t,this.z=n,this.w=i}get width(){return this.z}set width(e){this.z=e}get height(){return this.w}set height(e){this.w=e}set(e,t,n,i){return this.x=e,this.y=t,this.z=n,this.w=i,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this.w=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setW(e){return this.w=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;case 3:this.w=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;case 3:return this.w;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z,this.w)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this.w=e.w!==void 0?e.w:1,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this.w+=e.w,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this.w+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this.w=e.w+t.w,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this.w+=e.w*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this.w-=e.w,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this.w-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this.w=e.w-t.w,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this.w*=e.w,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this.w*=e,this}applyMatrix4(e){let t=this.x,n=this.y,i=this.z,r=this.w,o=e.elements;return this.x=o[0]*t+o[4]*n+o[8]*i+o[12]*r,this.y=o[1]*t+o[5]*n+o[9]*i+o[13]*r,this.z=o[2]*t+o[6]*n+o[10]*i+o[14]*r,this.w=o[3]*t+o[7]*n+o[11]*i+o[15]*r,this}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this.w/=e.w,this}divideScalar(e){return this.multiplyScalar(1/e)}setAxisAngleFromQuaternion(e){this.w=2*Math.acos(e.w);let t=Math.sqrt(1-e.w*e.w);return t<1e-4?(this.x=1,this.y=0,this.z=0):(this.x=e.x/t,this.y=e.y/t,this.z=e.z/t),this}setAxisAngleFromRotationMatrix(e){let t,n,i,r,c=e.elements,l=c[0],h=c[4],u=c[8],d=c[1],p=c[5],g=c[9],_=c[2],m=c[6],f=c[10];if(Math.abs(h-d)<.01&&Math.abs(u-_)<.01&&Math.abs(g-m)<.01){if(Math.abs(h+d)<.1&&Math.abs(u+_)<.1&&Math.abs(g+m)<.1&&Math.abs(l+p+f-3)<.1)return this.set(1,0,0,0),this;t=Math.PI;let S=(l+1)/2,x=(p+1)/2,P=(f+1)/2,T=(h+d)/4,w=(u+_)/4,R=(g+m)/4;return S>x&&S>P?S<.01?(n=0,i=.707106781,r=.707106781):(n=Math.sqrt(S),i=T/n,r=w/n):x>P?x<.01?(n=.707106781,i=0,r=.707106781):(i=Math.sqrt(x),n=T/i,r=R/i):P<.01?(n=.707106781,i=.707106781,r=0):(r=Math.sqrt(P),n=w/r,i=R/r),this.set(n,i,r,t),this}let v=Math.sqrt((m-g)*(m-g)+(u-_)*(u-_)+(d-h)*(d-h));return Math.abs(v)<.001&&(v=1),this.x=(m-g)/v,this.y=(u-_)/v,this.z=(d-h)/v,this.w=Math.acos((l+p+f-1)/2),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this.w=t[15],this}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this.w=Math.min(this.w,e.w),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this.w=Math.max(this.w,e.w),this}clamp(e,t){return this.x=ht(this.x,e.x,t.x),this.y=ht(this.y,e.y,t.y),this.z=ht(this.z,e.z,t.z),this.w=ht(this.w,e.w,t.w),this}clampScalar(e,t){return this.x=ht(this.x,e,t),this.y=ht(this.y,e,t),this.z=ht(this.z,e,t),this.w=ht(this.w,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(ht(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this.w=Math.floor(this.w),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this.w=Math.ceil(this.w),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this.w=Math.round(this.w),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this.w=Math.trunc(this.w),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this.w=-this.w,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z+this.w*e.w}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z+this.w*this.w)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)+Math.abs(this.w)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this.w+=(e.w-this.w)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this.w=e.w+(t.w-e.w)*n,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z&&e.w===this.w}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this.w=e[t+3],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e[t+3]=this.w,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this.w=e.getW(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this.w=Math.random(),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z,yield this.w}},pa=class extends Ri{constructor(e=1,t=1,n={}){super(),this.isRenderTarget=!0,this.width=e,this.height=t,this.depth=1,this.scissor=new _t(0,0,e,t),this.scissorTest=!1,this.viewport=new _t(0,0,e,t);let i={width:e,height:t,depth:1};n=Object.assign({generateMipmaps:!1,internalFormat:null,minFilter:Nt,depthBuffer:!0,stencilBuffer:!1,resolveDepthBuffer:!0,resolveStencilBuffer:!0,depthTexture:null,samples:0,count:1},n);let r=new $t(i,n.mapping,n.wrapS,n.wrapT,n.magFilter,n.minFilter,n.format,n.type,n.anisotropy,n.colorSpace);r.flipY=!1,r.generateMipmaps=n.generateMipmaps,r.internalFormat=n.internalFormat,this.textures=[];let o=n.count;for(let a=0;a<o;a++)this.textures[a]=r.clone(),this.textures[a].isRenderTargetTexture=!0,this.textures[a].renderTarget=this;this.depthBuffer=n.depthBuffer,this.stencilBuffer=n.stencilBuffer,this.resolveDepthBuffer=n.resolveDepthBuffer,this.resolveStencilBuffer=n.resolveStencilBuffer,this._depthTexture=null,this.depthTexture=n.depthTexture,this.samples=n.samples}get texture(){return this.textures[0]}set texture(e){this.textures[0]=e}set depthTexture(e){this._depthTexture!==null&&(this._depthTexture.renderTarget=null),e!==null&&(e.renderTarget=this),this._depthTexture=e}get depthTexture(){return this._depthTexture}setSize(e,t,n=1){if(this.width!==e||this.height!==t||this.depth!==n){this.width=e,this.height=t,this.depth=n;for(let i=0,r=this.textures.length;i<r;i++)this.textures[i].image.width=e,this.textures[i].image.height=t,this.textures[i].image.depth=n;this.dispose()}this.viewport.set(0,0,e,t),this.scissor.set(0,0,e,t)}clone(){return new this.constructor().copy(this)}copy(e){this.width=e.width,this.height=e.height,this.depth=e.depth,this.scissor.copy(e.scissor),this.scissorTest=e.scissorTest,this.viewport.copy(e.viewport),this.textures.length=0;for(let t=0,n=e.textures.length;t<n;t++){this.textures[t]=e.textures[t].clone(),this.textures[t].isRenderTargetTexture=!0,this.textures[t].renderTarget=this;let i=Object.assign({},e.textures[t].image);this.textures[t].source=new hr(i)}return this.depthBuffer=e.depthBuffer,this.stencilBuffer=e.stencilBuffer,this.resolveDepthBuffer=e.resolveDepthBuffer,this.resolveStencilBuffer=e.resolveStencilBuffer,e.depthTexture!==null&&(this.depthTexture=e.depthTexture.clone()),this.samples=e.samples,this}dispose(){this.dispatchEvent({type:"dispose"})}},ai=class extends pa{constructor(e=1,t=1,n={}){super(e,t,n),this.isWebGLRenderTarget=!0}},qr=class extends $t{constructor(e=null,t=1,n=1,i=1){super(null),this.isDataArrayTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=ln,this.minFilter=ln,this.wrapR=Mn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1,this.layerUpdates=new Set}addLayerUpdate(e){this.layerUpdates.add(e)}clearLayerUpdates(){this.layerUpdates.clear()}};var ma=class extends $t{constructor(e=null,t=1,n=1,i=1){super(null),this.isData3DTexture=!0,this.image={data:e,width:t,height:n,depth:i},this.magFilter=ln,this.minFilter=ln,this.wrapR=Mn,this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}};var Tn=class{constructor(e=0,t=0,n=0,i=1){this.isQuaternion=!0,this._x=e,this._y=t,this._z=n,this._w=i}static slerpFlat(e,t,n,i,r,o,a){let c=n[i+0],l=n[i+1],h=n[i+2],u=n[i+3],d=r[o+0],p=r[o+1],g=r[o+2],_=r[o+3];if(a===0){e[t+0]=c,e[t+1]=l,e[t+2]=h,e[t+3]=u;return}if(a===1){e[t+0]=d,e[t+1]=p,e[t+2]=g,e[t+3]=_;return}if(u!==_||c!==d||l!==p||h!==g){let m=1-a,f=c*d+l*p+h*g+u*_,v=f>=0?1:-1,S=1-f*f;if(S>Number.EPSILON){let P=Math.sqrt(S),T=Math.atan2(P,f*v);m=Math.sin(m*T)/P,a=Math.sin(a*T)/P}let x=a*v;if(c=c*m+d*x,l=l*m+p*x,h=h*m+g*x,u=u*m+_*x,m===1-a){let P=1/Math.sqrt(c*c+l*l+h*h+u*u);c*=P,l*=P,h*=P,u*=P}}e[t]=c,e[t+1]=l,e[t+2]=h,e[t+3]=u}static multiplyQuaternionsFlat(e,t,n,i,r,o){let a=n[i],c=n[i+1],l=n[i+2],h=n[i+3],u=r[o],d=r[o+1],p=r[o+2],g=r[o+3];return e[t]=a*g+h*u+c*p-l*d,e[t+1]=c*g+h*d+l*u-a*p,e[t+2]=l*g+h*p+a*d-c*u,e[t+3]=h*g-a*u-c*d-l*p,e}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get w(){return this._w}set w(e){this._w=e,this._onChangeCallback()}set(e,t,n,i){return this._x=e,this._y=t,this._z=n,this._w=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._w)}copy(e){return this._x=e.x,this._y=e.y,this._z=e.z,this._w=e.w,this._onChangeCallback(),this}setFromEuler(e,t=!0){let n=e._x,i=e._y,r=e._z,o=e._order,a=Math.cos,c=Math.sin,l=a(n/2),h=a(i/2),u=a(r/2),d=c(n/2),p=c(i/2),g=c(r/2);switch(o){case"XYZ":this._x=d*h*u+l*p*g,this._y=l*p*u-d*h*g,this._z=l*h*g+d*p*u,this._w=l*h*u-d*p*g;break;case"YXZ":this._x=d*h*u+l*p*g,this._y=l*p*u-d*h*g,this._z=l*h*g-d*p*u,this._w=l*h*u+d*p*g;break;case"ZXY":this._x=d*h*u-l*p*g,this._y=l*p*u+d*h*g,this._z=l*h*g+d*p*u,this._w=l*h*u-d*p*g;break;case"ZYX":this._x=d*h*u-l*p*g,this._y=l*p*u+d*h*g,this._z=l*h*g-d*p*u,this._w=l*h*u+d*p*g;break;case"YZX":this._x=d*h*u+l*p*g,this._y=l*p*u+d*h*g,this._z=l*h*g-d*p*u,this._w=l*h*u-d*p*g;break;case"XZY":this._x=d*h*u-l*p*g,this._y=l*p*u-d*h*g,this._z=l*h*g+d*p*u,this._w=l*h*u+d*p*g;break;default:console.warn("THREE.Quaternion: .setFromEuler() encountered an unknown order: "+o)}return t===!0&&this._onChangeCallback(),this}setFromAxisAngle(e,t){let n=t/2,i=Math.sin(n);return this._x=e.x*i,this._y=e.y*i,this._z=e.z*i,this._w=Math.cos(n),this._onChangeCallback(),this}setFromRotationMatrix(e){let t=e.elements,n=t[0],i=t[4],r=t[8],o=t[1],a=t[5],c=t[9],l=t[2],h=t[6],u=t[10],d=n+a+u;if(d>0){let p=.5/Math.sqrt(d+1);this._w=.25/p,this._x=(h-c)*p,this._y=(r-l)*p,this._z=(o-i)*p}else if(n>a&&n>u){let p=2*Math.sqrt(1+n-a-u);this._w=(h-c)/p,this._x=.25*p,this._y=(i+o)/p,this._z=(r+l)/p}else if(a>u){let p=2*Math.sqrt(1+a-n-u);this._w=(r-l)/p,this._x=(i+o)/p,this._y=.25*p,this._z=(c+h)/p}else{let p=2*Math.sqrt(1+u-n-a);this._w=(o-i)/p,this._x=(r+l)/p,this._y=(c+h)/p,this._z=.25*p}return this._onChangeCallback(),this}setFromUnitVectors(e,t){let n=e.dot(t)+1;return n<Number.EPSILON?(n=0,Math.abs(e.x)>Math.abs(e.z)?(this._x=-e.y,this._y=e.x,this._z=0,this._w=n):(this._x=0,this._y=-e.z,this._z=e.y,this._w=n)):(this._x=e.y*t.z-e.z*t.y,this._y=e.z*t.x-e.x*t.z,this._z=e.x*t.y-e.y*t.x,this._w=n),this.normalize()}angleTo(e){return 2*Math.acos(Math.abs(ht(this.dot(e),-1,1)))}rotateTowards(e,t){let n=this.angleTo(e);if(n===0)return this;let i=Math.min(1,t/n);return this.slerp(e,i),this}identity(){return this.set(0,0,0,1)}invert(){return this.conjugate()}conjugate(){return this._x*=-1,this._y*=-1,this._z*=-1,this._onChangeCallback(),this}dot(e){return this._x*e._x+this._y*e._y+this._z*e._z+this._w*e._w}lengthSq(){return this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w}length(){return Math.sqrt(this._x*this._x+this._y*this._y+this._z*this._z+this._w*this._w)}normalize(){let e=this.length();return e===0?(this._x=0,this._y=0,this._z=0,this._w=1):(e=1/e,this._x=this._x*e,this._y=this._y*e,this._z=this._z*e,this._w=this._w*e),this._onChangeCallback(),this}multiply(e){return this.multiplyQuaternions(this,e)}premultiply(e){return this.multiplyQuaternions(e,this)}multiplyQuaternions(e,t){let n=e._x,i=e._y,r=e._z,o=e._w,a=t._x,c=t._y,l=t._z,h=t._w;return this._x=n*h+o*a+i*l-r*c,this._y=i*h+o*c+r*a-n*l,this._z=r*h+o*l+n*c-i*a,this._w=o*h-n*a-i*c-r*l,this._onChangeCallback(),this}slerp(e,t){if(t===0)return this;if(t===1)return this.copy(e);let n=this._x,i=this._y,r=this._z,o=this._w,a=o*e._w+n*e._x+i*e._y+r*e._z;if(a<0?(this._w=-e._w,this._x=-e._x,this._y=-e._y,this._z=-e._z,a=-a):this.copy(e),a>=1)return this._w=o,this._x=n,this._y=i,this._z=r,this;let c=1-a*a;if(c<=Number.EPSILON){let p=1-t;return this._w=p*o+t*this._w,this._x=p*n+t*this._x,this._y=p*i+t*this._y,this._z=p*r+t*this._z,this.normalize(),this}let l=Math.sqrt(c),h=Math.atan2(l,a),u=Math.sin((1-t)*h)/l,d=Math.sin(t*h)/l;return this._w=o*u+this._w*d,this._x=n*u+this._x*d,this._y=i*u+this._y*d,this._z=r*u+this._z*d,this._onChangeCallback(),this}slerpQuaternions(e,t,n){return this.copy(e).slerp(t,n)}random(){let e=2*Math.PI*Math.random(),t=2*Math.PI*Math.random(),n=Math.random(),i=Math.sqrt(1-n),r=Math.sqrt(n);return this.set(i*Math.sin(e),i*Math.cos(e),r*Math.sin(t),r*Math.cos(t))}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._w===this._w}fromArray(e,t=0){return this._x=e[t],this._y=e[t+1],this._z=e[t+2],this._w=e[t+3],this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._w,e}fromBufferAttribute(e,t){return this._x=e.getX(t),this._y=e.getY(t),this._z=e.getZ(t),this._w=e.getW(t),this._onChangeCallback(),this}toJSON(){return this.toArray()}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._w}},D=class s{constructor(e=0,t=0,n=0){s.prototype.isVector3=!0,this.x=e,this.y=t,this.z=n}set(e,t,n){return n===void 0&&(n=this.z),this.x=e,this.y=t,this.z=n,this}setScalar(e){return this.x=e,this.y=e,this.z=e,this}setX(e){return this.x=e,this}setY(e){return this.y=e,this}setZ(e){return this.z=e,this}setComponent(e,t){switch(e){case 0:this.x=t;break;case 1:this.y=t;break;case 2:this.z=t;break;default:throw new Error("index is out of range: "+e)}return this}getComponent(e){switch(e){case 0:return this.x;case 1:return this.y;case 2:return this.z;default:throw new Error("index is out of range: "+e)}}clone(){return new this.constructor(this.x,this.y,this.z)}copy(e){return this.x=e.x,this.y=e.y,this.z=e.z,this}add(e){return this.x+=e.x,this.y+=e.y,this.z+=e.z,this}addScalar(e){return this.x+=e,this.y+=e,this.z+=e,this}addVectors(e,t){return this.x=e.x+t.x,this.y=e.y+t.y,this.z=e.z+t.z,this}addScaledVector(e,t){return this.x+=e.x*t,this.y+=e.y*t,this.z+=e.z*t,this}sub(e){return this.x-=e.x,this.y-=e.y,this.z-=e.z,this}subScalar(e){return this.x-=e,this.y-=e,this.z-=e,this}subVectors(e,t){return this.x=e.x-t.x,this.y=e.y-t.y,this.z=e.z-t.z,this}multiply(e){return this.x*=e.x,this.y*=e.y,this.z*=e.z,this}multiplyScalar(e){return this.x*=e,this.y*=e,this.z*=e,this}multiplyVectors(e,t){return this.x=e.x*t.x,this.y=e.y*t.y,this.z=e.z*t.z,this}applyEuler(e){return this.applyQuaternion(fu.setFromEuler(e))}applyAxisAngle(e,t){return this.applyQuaternion(fu.setFromAxisAngle(e,t))}applyMatrix3(e){let t=this.x,n=this.y,i=this.z,r=e.elements;return this.x=r[0]*t+r[3]*n+r[6]*i,this.y=r[1]*t+r[4]*n+r[7]*i,this.z=r[2]*t+r[5]*n+r[8]*i,this}applyNormalMatrix(e){return this.applyMatrix3(e).normalize()}applyMatrix4(e){let t=this.x,n=this.y,i=this.z,r=e.elements,o=1/(r[3]*t+r[7]*n+r[11]*i+r[15]);return this.x=(r[0]*t+r[4]*n+r[8]*i+r[12])*o,this.y=(r[1]*t+r[5]*n+r[9]*i+r[13])*o,this.z=(r[2]*t+r[6]*n+r[10]*i+r[14])*o,this}applyQuaternion(e){let t=this.x,n=this.y,i=this.z,r=e.x,o=e.y,a=e.z,c=e.w,l=2*(o*i-a*n),h=2*(a*t-r*i),u=2*(r*n-o*t);return this.x=t+c*l+o*u-a*h,this.y=n+c*h+a*l-r*u,this.z=i+c*u+r*h-o*l,this}project(e){return this.applyMatrix4(e.matrixWorldInverse).applyMatrix4(e.projectionMatrix)}unproject(e){return this.applyMatrix4(e.projectionMatrixInverse).applyMatrix4(e.matrixWorld)}transformDirection(e){let t=this.x,n=this.y,i=this.z,r=e.elements;return this.x=r[0]*t+r[4]*n+r[8]*i,this.y=r[1]*t+r[5]*n+r[9]*i,this.z=r[2]*t+r[6]*n+r[10]*i,this.normalize()}divide(e){return this.x/=e.x,this.y/=e.y,this.z/=e.z,this}divideScalar(e){return this.multiplyScalar(1/e)}min(e){return this.x=Math.min(this.x,e.x),this.y=Math.min(this.y,e.y),this.z=Math.min(this.z,e.z),this}max(e){return this.x=Math.max(this.x,e.x),this.y=Math.max(this.y,e.y),this.z=Math.max(this.z,e.z),this}clamp(e,t){return this.x=ht(this.x,e.x,t.x),this.y=ht(this.y,e.y,t.y),this.z=ht(this.z,e.z,t.z),this}clampScalar(e,t){return this.x=ht(this.x,e,t),this.y=ht(this.y,e,t),this.z=ht(this.z,e,t),this}clampLength(e,t){let n=this.length();return this.divideScalar(n||1).multiplyScalar(ht(n,e,t))}floor(){return this.x=Math.floor(this.x),this.y=Math.floor(this.y),this.z=Math.floor(this.z),this}ceil(){return this.x=Math.ceil(this.x),this.y=Math.ceil(this.y),this.z=Math.ceil(this.z),this}round(){return this.x=Math.round(this.x),this.y=Math.round(this.y),this.z=Math.round(this.z),this}roundToZero(){return this.x=Math.trunc(this.x),this.y=Math.trunc(this.y),this.z=Math.trunc(this.z),this}negate(){return this.x=-this.x,this.y=-this.y,this.z=-this.z,this}dot(e){return this.x*e.x+this.y*e.y+this.z*e.z}lengthSq(){return this.x*this.x+this.y*this.y+this.z*this.z}length(){return Math.sqrt(this.x*this.x+this.y*this.y+this.z*this.z)}manhattanLength(){return Math.abs(this.x)+Math.abs(this.y)+Math.abs(this.z)}normalize(){return this.divideScalar(this.length()||1)}setLength(e){return this.normalize().multiplyScalar(e)}lerp(e,t){return this.x+=(e.x-this.x)*t,this.y+=(e.y-this.y)*t,this.z+=(e.z-this.z)*t,this}lerpVectors(e,t,n){return this.x=e.x+(t.x-e.x)*n,this.y=e.y+(t.y-e.y)*n,this.z=e.z+(t.z-e.z)*n,this}cross(e){return this.crossVectors(this,e)}crossVectors(e,t){let n=e.x,i=e.y,r=e.z,o=t.x,a=t.y,c=t.z;return this.x=i*c-r*a,this.y=r*o-n*c,this.z=n*a-i*o,this}projectOnVector(e){let t=e.lengthSq();if(t===0)return this.set(0,0,0);let n=e.dot(this)/t;return this.copy(e).multiplyScalar(n)}projectOnPlane(e){return Wc.copy(this).projectOnVector(e),this.sub(Wc)}reflect(e){return this.sub(Wc.copy(e).multiplyScalar(2*this.dot(e)))}angleTo(e){let t=Math.sqrt(this.lengthSq()*e.lengthSq());if(t===0)return Math.PI/2;let n=this.dot(e)/t;return Math.acos(ht(n,-1,1))}distanceTo(e){return Math.sqrt(this.distanceToSquared(e))}distanceToSquared(e){let t=this.x-e.x,n=this.y-e.y,i=this.z-e.z;return t*t+n*n+i*i}manhattanDistanceTo(e){return Math.abs(this.x-e.x)+Math.abs(this.y-e.y)+Math.abs(this.z-e.z)}setFromSpherical(e){return this.setFromSphericalCoords(e.radius,e.phi,e.theta)}setFromSphericalCoords(e,t,n){let i=Math.sin(t)*e;return this.x=i*Math.sin(n),this.y=Math.cos(t)*e,this.z=i*Math.cos(n),this}setFromCylindrical(e){return this.setFromCylindricalCoords(e.radius,e.theta,e.y)}setFromCylindricalCoords(e,t,n){return this.x=e*Math.sin(t),this.y=n,this.z=e*Math.cos(t),this}setFromMatrixPosition(e){let t=e.elements;return this.x=t[12],this.y=t[13],this.z=t[14],this}setFromMatrixScale(e){let t=this.setFromMatrixColumn(e,0).length(),n=this.setFromMatrixColumn(e,1).length(),i=this.setFromMatrixColumn(e,2).length();return this.x=t,this.y=n,this.z=i,this}setFromMatrixColumn(e,t){return this.fromArray(e.elements,t*4)}setFromMatrix3Column(e,t){return this.fromArray(e.elements,t*3)}setFromEuler(e){return this.x=e._x,this.y=e._y,this.z=e._z,this}setFromColor(e){return this.x=e.r,this.y=e.g,this.z=e.b,this}equals(e){return e.x===this.x&&e.y===this.y&&e.z===this.z}fromArray(e,t=0){return this.x=e[t],this.y=e[t+1],this.z=e[t+2],this}toArray(e=[],t=0){return e[t]=this.x,e[t+1]=this.y,e[t+2]=this.z,e}fromBufferAttribute(e,t){return this.x=e.getX(t),this.y=e.getY(t),this.z=e.getZ(t),this}random(){return this.x=Math.random(),this.y=Math.random(),this.z=Math.random(),this}randomDirection(){let e=Math.random()*Math.PI*2,t=Math.random()*2-1,n=Math.sqrt(1-t*t);return this.x=n*Math.cos(e),this.y=t,this.z=n*Math.sin(e),this}*[Symbol.iterator](){yield this.x,yield this.y,yield this.z}},Wc=new D,fu=new Tn,rn=class{constructor(e=new D(1/0,1/0,1/0),t=new D(-1/0,-1/0,-1/0)){this.isBox3=!0,this.min=e,this.max=t}set(e,t){return this.min.copy(e),this.max.copy(t),this}setFromArray(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t+=3)this.expandByPoint(Vn.fromArray(e,t));return this}setFromBufferAttribute(e){this.makeEmpty();for(let t=0,n=e.count;t<n;t++)this.expandByPoint(Vn.fromBufferAttribute(e,t));return this}setFromPoints(e){this.makeEmpty();for(let t=0,n=e.length;t<n;t++)this.expandByPoint(e[t]);return this}setFromCenterAndSize(e,t){let n=Vn.copy(t).multiplyScalar(.5);return this.min.copy(e).sub(n),this.max.copy(e).add(n),this}setFromObject(e,t=!1){return this.makeEmpty(),this.expandByObject(e,t)}clone(){return new this.constructor().copy(this)}copy(e){return this.min.copy(e.min),this.max.copy(e.max),this}makeEmpty(){return this.min.x=this.min.y=this.min.z=1/0,this.max.x=this.max.y=this.max.z=-1/0,this}isEmpty(){return this.max.x<this.min.x||this.max.y<this.min.y||this.max.z<this.min.z}getCenter(e){return this.isEmpty()?e.set(0,0,0):e.addVectors(this.min,this.max).multiplyScalar(.5)}getSize(e){return this.isEmpty()?e.set(0,0,0):e.subVectors(this.max,this.min)}expandByPoint(e){return this.min.min(e),this.max.max(e),this}expandByVector(e){return this.min.sub(e),this.max.add(e),this}expandByScalar(e){return this.min.addScalar(-e),this.max.addScalar(e),this}expandByObject(e,t=!1){e.updateWorldMatrix(!1,!1);let n=e.geometry;if(n!==void 0){let r=n.getAttribute("position");if(t===!0&&r!==void 0&&e.isInstancedMesh!==!0)for(let o=0,a=r.count;o<a;o++)e.isMesh===!0?e.getVertexPosition(o,Vn):Vn.fromBufferAttribute(r,o),Vn.applyMatrix4(e.matrixWorld),this.expandByPoint(Vn);else e.boundingBox!==void 0?(e.boundingBox===null&&e.computeBoundingBox(),Fo.copy(e.boundingBox)):(n.boundingBox===null&&n.computeBoundingBox(),Fo.copy(n.boundingBox)),Fo.applyMatrix4(e.matrixWorld),this.union(Fo)}let i=e.children;for(let r=0,o=i.length;r<o;r++)this.expandByObject(i[r],t);return this}containsPoint(e){return e.x>=this.min.x&&e.x<=this.max.x&&e.y>=this.min.y&&e.y<=this.max.y&&e.z>=this.min.z&&e.z<=this.max.z}containsBox(e){return this.min.x<=e.min.x&&e.max.x<=this.max.x&&this.min.y<=e.min.y&&e.max.y<=this.max.y&&this.min.z<=e.min.z&&e.max.z<=this.max.z}getParameter(e,t){return t.set((e.x-this.min.x)/(this.max.x-this.min.x),(e.y-this.min.y)/(this.max.y-this.min.y),(e.z-this.min.z)/(this.max.z-this.min.z))}intersectsBox(e){return e.max.x>=this.min.x&&e.min.x<=this.max.x&&e.max.y>=this.min.y&&e.min.y<=this.max.y&&e.max.z>=this.min.z&&e.min.z<=this.max.z}intersectsSphere(e){return this.clampPoint(e.center,Vn),Vn.distanceToSquared(e.center)<=e.radius*e.radius}intersectsPlane(e){let t,n;return e.normal.x>0?(t=e.normal.x*this.min.x,n=e.normal.x*this.max.x):(t=e.normal.x*this.max.x,n=e.normal.x*this.min.x),e.normal.y>0?(t+=e.normal.y*this.min.y,n+=e.normal.y*this.max.y):(t+=e.normal.y*this.max.y,n+=e.normal.y*this.min.y),e.normal.z>0?(t+=e.normal.z*this.min.z,n+=e.normal.z*this.max.z):(t+=e.normal.z*this.max.z,n+=e.normal.z*this.min.z),t<=-e.constant&&n>=-e.constant}intersectsTriangle(e){if(this.isEmpty())return!1;this.getCenter(Lr),Bo.subVectors(this.max,Lr),Xs.subVectors(e.a,Lr),Ys.subVectors(e.b,Lr),qs.subVectors(e.c,Lr),ki.subVectors(Ys,Xs),Gi.subVectors(qs,Ys),os.subVectors(Xs,qs);let t=[0,-ki.z,ki.y,0,-Gi.z,Gi.y,0,-os.z,os.y,ki.z,0,-ki.x,Gi.z,0,-Gi.x,os.z,0,-os.x,-ki.y,ki.x,0,-Gi.y,Gi.x,0,-os.y,os.x,0];return!Xc(t,Xs,Ys,qs,Bo)||(t=[1,0,0,0,1,0,0,0,1],!Xc(t,Xs,Ys,qs,Bo))?!1:(Oo.crossVectors(ki,Gi),t=[Oo.x,Oo.y,Oo.z],Xc(t,Xs,Ys,qs,Bo))}clampPoint(e,t){return t.copy(e).clamp(this.min,this.max)}distanceToPoint(e){return this.clampPoint(e,Vn).distanceTo(e)}getBoundingSphere(e){return this.isEmpty()?e.makeEmpty():(this.getCenter(e.center),e.radius=this.getSize(Vn).length()*.5),e}intersect(e){return this.min.max(e.min),this.max.min(e.max),this.isEmpty()&&this.makeEmpty(),this}union(e){return this.min.min(e.min),this.max.max(e.max),this}applyMatrix4(e){return this.isEmpty()?this:(xi[0].set(this.min.x,this.min.y,this.min.z).applyMatrix4(e),xi[1].set(this.min.x,this.min.y,this.max.z).applyMatrix4(e),xi[2].set(this.min.x,this.max.y,this.min.z).applyMatrix4(e),xi[3].set(this.min.x,this.max.y,this.max.z).applyMatrix4(e),xi[4].set(this.max.x,this.min.y,this.min.z).applyMatrix4(e),xi[5].set(this.max.x,this.min.y,this.max.z).applyMatrix4(e),xi[6].set(this.max.x,this.max.y,this.min.z).applyMatrix4(e),xi[7].set(this.max.x,this.max.y,this.max.z).applyMatrix4(e),this.setFromPoints(xi),this)}translate(e){return this.min.add(e),this.max.add(e),this}equals(e){return e.min.equals(this.min)&&e.max.equals(this.max)}},xi=[new D,new D,new D,new D,new D,new D,new D,new D],Vn=new D,Fo=new rn,Xs=new D,Ys=new D,qs=new D,ki=new D,Gi=new D,os=new D,Lr=new D,Bo=new D,Oo=new D,as=new D;function Xc(s,e,t,n,i){for(let r=0,o=s.length-3;r<=o;r+=3){as.fromArray(s,r);let a=i.x*Math.abs(as.x)+i.y*Math.abs(as.y)+i.z*Math.abs(as.z),c=e.dot(as),l=t.dot(as),h=n.dot(as);if(Math.max(-Math.max(c,l,h),Math.min(c,l,h))>a)return!1}return!0}var Vp=new rn,Dr=new D,Yc=new D,An=class{constructor(e=new D,t=-1){this.isSphere=!0,this.center=e,this.radius=t}set(e,t){return this.center.copy(e),this.radius=t,this}setFromPoints(e,t){let n=this.center;t!==void 0?n.copy(t):Vp.setFromPoints(e).getCenter(n);let i=0;for(let r=0,o=e.length;r<o;r++)i=Math.max(i,n.distanceToSquared(e[r]));return this.radius=Math.sqrt(i),this}copy(e){return this.center.copy(e.center),this.radius=e.radius,this}isEmpty(){return this.radius<0}makeEmpty(){return this.center.set(0,0,0),this.radius=-1,this}containsPoint(e){return e.distanceToSquared(this.center)<=this.radius*this.radius}distanceToPoint(e){return e.distanceTo(this.center)-this.radius}intersectsSphere(e){let t=this.radius+e.radius;return e.center.distanceToSquared(this.center)<=t*t}intersectsBox(e){return e.intersectsSphere(this)}intersectsPlane(e){return Math.abs(e.distanceToPoint(this.center))<=this.radius}clampPoint(e,t){let n=this.center.distanceToSquared(e);return t.copy(e),n>this.radius*this.radius&&(t.sub(this.center).normalize(),t.multiplyScalar(this.radius).add(this.center)),t}getBoundingBox(e){return this.isEmpty()?(e.makeEmpty(),e):(e.set(this.center,this.center),e.expandByScalar(this.radius),e)}applyMatrix4(e){return this.center.applyMatrix4(e),this.radius=this.radius*e.getMaxScaleOnAxis(),this}translate(e){return this.center.add(e),this}expandByPoint(e){if(this.isEmpty())return this.center.copy(e),this.radius=0,this;Dr.subVectors(e,this.center);let t=Dr.lengthSq();if(t>this.radius*this.radius){let n=Math.sqrt(t),i=(n-this.radius)*.5;this.center.addScaledVector(Dr,i/n),this.radius+=i}return this}union(e){return e.isEmpty()?this:this.isEmpty()?(this.copy(e),this):(this.center.equals(e.center)===!0?this.radius=Math.max(this.radius,e.radius):(Yc.subVectors(e.center,this.center).setLength(e.radius),this.expandByPoint(Dr.copy(e.center).add(Yc)),this.expandByPoint(Dr.copy(e.center).sub(Yc))),this)}equals(e){return e.center.equals(this.center)&&e.radius===this.radius}clone(){return new this.constructor().copy(this)}},yi=new D,qc=new D,zo=new D,Vi=new D,Zc=new D,Ho=new D,Kc=new D,xs=class{constructor(e=new D,t=new D(0,0,-1)){this.origin=e,this.direction=t}set(e,t){return this.origin.copy(e),this.direction.copy(t),this}copy(e){return this.origin.copy(e.origin),this.direction.copy(e.direction),this}at(e,t){return t.copy(this.origin).addScaledVector(this.direction,e)}lookAt(e){return this.direction.copy(e).sub(this.origin).normalize(),this}recast(e){return this.origin.copy(this.at(e,yi)),this}closestPointToPoint(e,t){t.subVectors(e,this.origin);let n=t.dot(this.direction);return n<0?t.copy(this.origin):t.copy(this.origin).addScaledVector(this.direction,n)}distanceToPoint(e){return Math.sqrt(this.distanceSqToPoint(e))}distanceSqToPoint(e){let t=yi.subVectors(e,this.origin).dot(this.direction);return t<0?this.origin.distanceToSquared(e):(yi.copy(this.origin).addScaledVector(this.direction,t),yi.distanceToSquared(e))}distanceSqToSegment(e,t,n,i){qc.copy(e).add(t).multiplyScalar(.5),zo.copy(t).sub(e).normalize(),Vi.copy(this.origin).sub(qc);let r=e.distanceTo(t)*.5,o=-this.direction.dot(zo),a=Vi.dot(this.direction),c=-Vi.dot(zo),l=Vi.lengthSq(),h=Math.abs(1-o*o),u,d,p,g;if(h>0)if(u=o*c-a,d=o*a-c,g=r*h,u>=0)if(d>=-g)if(d<=g){let _=1/h;u*=_,d*=_,p=u*(u+o*d+2*a)+d*(o*u+d+2*c)+l}else d=r,u=Math.max(0,-(o*d+a)),p=-u*u+d*(d+2*c)+l;else d=-r,u=Math.max(0,-(o*d+a)),p=-u*u+d*(d+2*c)+l;else d<=-g?(u=Math.max(0,-(-o*r+a)),d=u>0?-r:Math.min(Math.max(-r,-c),r),p=-u*u+d*(d+2*c)+l):d<=g?(u=0,d=Math.min(Math.max(-r,-c),r),p=d*(d+2*c)+l):(u=Math.max(0,-(o*r+a)),d=u>0?r:Math.min(Math.max(-r,-c),r),p=-u*u+d*(d+2*c)+l);else d=o>0?-r:r,u=Math.max(0,-(o*d+a)),p=-u*u+d*(d+2*c)+l;return n&&n.copy(this.origin).addScaledVector(this.direction,u),i&&i.copy(qc).addScaledVector(zo,d),p}intersectSphere(e,t){yi.subVectors(e.center,this.origin);let n=yi.dot(this.direction),i=yi.dot(yi)-n*n,r=e.radius*e.radius;if(i>r)return null;let o=Math.sqrt(r-i),a=n-o,c=n+o;return c<0?null:a<0?this.at(c,t):this.at(a,t)}intersectsSphere(e){return this.distanceSqToPoint(e.center)<=e.radius*e.radius}distanceToPlane(e){let t=e.normal.dot(this.direction);if(t===0)return e.distanceToPoint(this.origin)===0?0:null;let n=-(this.origin.dot(e.normal)+e.constant)/t;return n>=0?n:null}intersectPlane(e,t){let n=this.distanceToPlane(e);return n===null?null:this.at(n,t)}intersectsPlane(e){let t=e.distanceToPoint(this.origin);return t===0||e.normal.dot(this.direction)*t<0}intersectBox(e,t){let n,i,r,o,a,c,l=1/this.direction.x,h=1/this.direction.y,u=1/this.direction.z,d=this.origin;return l>=0?(n=(e.min.x-d.x)*l,i=(e.max.x-d.x)*l):(n=(e.max.x-d.x)*l,i=(e.min.x-d.x)*l),h>=0?(r=(e.min.y-d.y)*h,o=(e.max.y-d.y)*h):(r=(e.max.y-d.y)*h,o=(e.min.y-d.y)*h),n>o||r>i||((r>n||isNaN(n))&&(n=r),(o<i||isNaN(i))&&(i=o),u>=0?(a=(e.min.z-d.z)*u,c=(e.max.z-d.z)*u):(a=(e.max.z-d.z)*u,c=(e.min.z-d.z)*u),n>c||a>i)||((a>n||n!==n)&&(n=a),(c<i||i!==i)&&(i=c),i<0)?null:this.at(n>=0?n:i,t)}intersectsBox(e){return this.intersectBox(e,yi)!==null}intersectTriangle(e,t,n,i,r){Zc.subVectors(t,e),Ho.subVectors(n,e),Kc.crossVectors(Zc,Ho);let o=this.direction.dot(Kc),a;if(o>0){if(i)return null;a=1}else if(o<0)a=-1,o=-o;else return null;Vi.subVectors(this.origin,e);let c=a*this.direction.dot(Ho.crossVectors(Vi,Ho));if(c<0)return null;let l=a*this.direction.dot(Zc.cross(Vi));if(l<0||c+l>o)return null;let h=-a*Vi.dot(Kc);return h<0?null:this.at(h/o,r)}applyMatrix4(e){return this.origin.applyMatrix4(e),this.direction.transformDirection(e),this}equals(e){return e.origin.equals(this.origin)&&e.direction.equals(this.direction)}clone(){return new this.constructor().copy(this)}},Ze=class s{constructor(e,t,n,i,r,o,a,c,l,h,u,d,p,g,_,m){s.prototype.isMatrix4=!0,this.elements=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],e!==void 0&&this.set(e,t,n,i,r,o,a,c,l,h,u,d,p,g,_,m)}set(e,t,n,i,r,o,a,c,l,h,u,d,p,g,_,m){let f=this.elements;return f[0]=e,f[4]=t,f[8]=n,f[12]=i,f[1]=r,f[5]=o,f[9]=a,f[13]=c,f[2]=l,f[6]=h,f[10]=u,f[14]=d,f[3]=p,f[7]=g,f[11]=_,f[15]=m,this}identity(){return this.set(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1),this}clone(){return new s().fromArray(this.elements)}copy(e){let t=this.elements,n=e.elements;return t[0]=n[0],t[1]=n[1],t[2]=n[2],t[3]=n[3],t[4]=n[4],t[5]=n[5],t[6]=n[6],t[7]=n[7],t[8]=n[8],t[9]=n[9],t[10]=n[10],t[11]=n[11],t[12]=n[12],t[13]=n[13],t[14]=n[14],t[15]=n[15],this}copyPosition(e){let t=this.elements,n=e.elements;return t[12]=n[12],t[13]=n[13],t[14]=n[14],this}setFromMatrix3(e){let t=e.elements;return this.set(t[0],t[3],t[6],0,t[1],t[4],t[7],0,t[2],t[5],t[8],0,0,0,0,1),this}extractBasis(e,t,n){return e.setFromMatrixColumn(this,0),t.setFromMatrixColumn(this,1),n.setFromMatrixColumn(this,2),this}makeBasis(e,t,n){return this.set(e.x,t.x,n.x,0,e.y,t.y,n.y,0,e.z,t.z,n.z,0,0,0,0,1),this}extractRotation(e){let t=this.elements,n=e.elements,i=1/Zs.setFromMatrixColumn(e,0).length(),r=1/Zs.setFromMatrixColumn(e,1).length(),o=1/Zs.setFromMatrixColumn(e,2).length();return t[0]=n[0]*i,t[1]=n[1]*i,t[2]=n[2]*i,t[3]=0,t[4]=n[4]*r,t[5]=n[5]*r,t[6]=n[6]*r,t[7]=0,t[8]=n[8]*o,t[9]=n[9]*o,t[10]=n[10]*o,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromEuler(e){let t=this.elements,n=e.x,i=e.y,r=e.z,o=Math.cos(n),a=Math.sin(n),c=Math.cos(i),l=Math.sin(i),h=Math.cos(r),u=Math.sin(r);if(e.order==="XYZ"){let d=o*h,p=o*u,g=a*h,_=a*u;t[0]=c*h,t[4]=-c*u,t[8]=l,t[1]=p+g*l,t[5]=d-_*l,t[9]=-a*c,t[2]=_-d*l,t[6]=g+p*l,t[10]=o*c}else if(e.order==="YXZ"){let d=c*h,p=c*u,g=l*h,_=l*u;t[0]=d+_*a,t[4]=g*a-p,t[8]=o*l,t[1]=o*u,t[5]=o*h,t[9]=-a,t[2]=p*a-g,t[6]=_+d*a,t[10]=o*c}else if(e.order==="ZXY"){let d=c*h,p=c*u,g=l*h,_=l*u;t[0]=d-_*a,t[4]=-o*u,t[8]=g+p*a,t[1]=p+g*a,t[5]=o*h,t[9]=_-d*a,t[2]=-o*l,t[6]=a,t[10]=o*c}else if(e.order==="ZYX"){let d=o*h,p=o*u,g=a*h,_=a*u;t[0]=c*h,t[4]=g*l-p,t[8]=d*l+_,t[1]=c*u,t[5]=_*l+d,t[9]=p*l-g,t[2]=-l,t[6]=a*c,t[10]=o*c}else if(e.order==="YZX"){let d=o*c,p=o*l,g=a*c,_=a*l;t[0]=c*h,t[4]=_-d*u,t[8]=g*u+p,t[1]=u,t[5]=o*h,t[9]=-a*h,t[2]=-l*h,t[6]=p*u+g,t[10]=d-_*u}else if(e.order==="XZY"){let d=o*c,p=o*l,g=a*c,_=a*l;t[0]=c*h,t[4]=-u,t[8]=l*h,t[1]=d*u+_,t[5]=o*h,t[9]=p*u-g,t[2]=g*u-p,t[6]=a*h,t[10]=_*u+d}return t[3]=0,t[7]=0,t[11]=0,t[12]=0,t[13]=0,t[14]=0,t[15]=1,this}makeRotationFromQuaternion(e){return this.compose(Wp,e,Xp)}lookAt(e,t,n){let i=this.elements;return Rn.subVectors(e,t),Rn.lengthSq()===0&&(Rn.z=1),Rn.normalize(),Wi.crossVectors(n,Rn),Wi.lengthSq()===0&&(Math.abs(n.z)===1?Rn.x+=1e-4:Rn.z+=1e-4,Rn.normalize(),Wi.crossVectors(n,Rn)),Wi.normalize(),ko.crossVectors(Rn,Wi),i[0]=Wi.x,i[4]=ko.x,i[8]=Rn.x,i[1]=Wi.y,i[5]=ko.y,i[9]=Rn.y,i[2]=Wi.z,i[6]=ko.z,i[10]=Rn.z,this}multiply(e){return this.multiplyMatrices(this,e)}premultiply(e){return this.multiplyMatrices(e,this)}multiplyMatrices(e,t){let n=e.elements,i=t.elements,r=this.elements,o=n[0],a=n[4],c=n[8],l=n[12],h=n[1],u=n[5],d=n[9],p=n[13],g=n[2],_=n[6],m=n[10],f=n[14],v=n[3],S=n[7],x=n[11],P=n[15],T=i[0],w=i[4],R=i[8],M=i[12],y=i[1],I=i[5],F=i[9],U=i[13],O=i[2],$=i[6],k=i[10],ee=i[14],Y=i[3],ce=i[7],pe=i[11],Ie=i[15];return r[0]=o*T+a*y+c*O+l*Y,r[4]=o*w+a*I+c*$+l*ce,r[8]=o*R+a*F+c*k+l*pe,r[12]=o*M+a*U+c*ee+l*Ie,r[1]=h*T+u*y+d*O+p*Y,r[5]=h*w+u*I+d*$+p*ce,r[9]=h*R+u*F+d*k+p*pe,r[13]=h*M+u*U+d*ee+p*Ie,r[2]=g*T+_*y+m*O+f*Y,r[6]=g*w+_*I+m*$+f*ce,r[10]=g*R+_*F+m*k+f*pe,r[14]=g*M+_*U+m*ee+f*Ie,r[3]=v*T+S*y+x*O+P*Y,r[7]=v*w+S*I+x*$+P*ce,r[11]=v*R+S*F+x*k+P*pe,r[15]=v*M+S*U+x*ee+P*Ie,this}multiplyScalar(e){let t=this.elements;return t[0]*=e,t[4]*=e,t[8]*=e,t[12]*=e,t[1]*=e,t[5]*=e,t[9]*=e,t[13]*=e,t[2]*=e,t[6]*=e,t[10]*=e,t[14]*=e,t[3]*=e,t[7]*=e,t[11]*=e,t[15]*=e,this}determinant(){let e=this.elements,t=e[0],n=e[4],i=e[8],r=e[12],o=e[1],a=e[5],c=e[9],l=e[13],h=e[2],u=e[6],d=e[10],p=e[14],g=e[3],_=e[7],m=e[11],f=e[15];return g*(+r*c*u-i*l*u-r*a*d+n*l*d+i*a*p-n*c*p)+_*(+t*c*p-t*l*d+r*o*d-i*o*p+i*l*h-r*c*h)+m*(+t*l*u-t*a*p-r*o*u+n*o*p+r*a*h-n*l*h)+f*(-i*a*h-t*c*u+t*a*d+i*o*u-n*o*d+n*c*h)}transpose(){let e=this.elements,t;return t=e[1],e[1]=e[4],e[4]=t,t=e[2],e[2]=e[8],e[8]=t,t=e[6],e[6]=e[9],e[9]=t,t=e[3],e[3]=e[12],e[12]=t,t=e[7],e[7]=e[13],e[13]=t,t=e[11],e[11]=e[14],e[14]=t,this}setPosition(e,t,n){let i=this.elements;return e.isVector3?(i[12]=e.x,i[13]=e.y,i[14]=e.z):(i[12]=e,i[13]=t,i[14]=n),this}invert(){let e=this.elements,t=e[0],n=e[1],i=e[2],r=e[3],o=e[4],a=e[5],c=e[6],l=e[7],h=e[8],u=e[9],d=e[10],p=e[11],g=e[12],_=e[13],m=e[14],f=e[15],v=u*m*l-_*d*l+_*c*p-a*m*p-u*c*f+a*d*f,S=g*d*l-h*m*l-g*c*p+o*m*p+h*c*f-o*d*f,x=h*_*l-g*u*l+g*a*p-o*_*p-h*a*f+o*u*f,P=g*u*c-h*_*c-g*a*d+o*_*d+h*a*m-o*u*m,T=t*v+n*S+i*x+r*P;if(T===0)return this.set(0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0);let w=1/T;return e[0]=v*w,e[1]=(_*d*r-u*m*r-_*i*p+n*m*p+u*i*f-n*d*f)*w,e[2]=(a*m*r-_*c*r+_*i*l-n*m*l-a*i*f+n*c*f)*w,e[3]=(u*c*r-a*d*r-u*i*l+n*d*l+a*i*p-n*c*p)*w,e[4]=S*w,e[5]=(h*m*r-g*d*r+g*i*p-t*m*p-h*i*f+t*d*f)*w,e[6]=(g*c*r-o*m*r-g*i*l+t*m*l+o*i*f-t*c*f)*w,e[7]=(o*d*r-h*c*r+h*i*l-t*d*l-o*i*p+t*c*p)*w,e[8]=x*w,e[9]=(g*u*r-h*_*r-g*n*p+t*_*p+h*n*f-t*u*f)*w,e[10]=(o*_*r-g*a*r+g*n*l-t*_*l-o*n*f+t*a*f)*w,e[11]=(h*a*r-o*u*r-h*n*l+t*u*l+o*n*p-t*a*p)*w,e[12]=P*w,e[13]=(h*_*i-g*u*i+g*n*d-t*_*d-h*n*m+t*u*m)*w,e[14]=(g*a*i-o*_*i-g*n*c+t*_*c+o*n*m-t*a*m)*w,e[15]=(o*u*i-h*a*i+h*n*c-t*u*c-o*n*d+t*a*d)*w,this}scale(e){let t=this.elements,n=e.x,i=e.y,r=e.z;return t[0]*=n,t[4]*=i,t[8]*=r,t[1]*=n,t[5]*=i,t[9]*=r,t[2]*=n,t[6]*=i,t[10]*=r,t[3]*=n,t[7]*=i,t[11]*=r,this}getMaxScaleOnAxis(){let e=this.elements,t=e[0]*e[0]+e[1]*e[1]+e[2]*e[2],n=e[4]*e[4]+e[5]*e[5]+e[6]*e[6],i=e[8]*e[8]+e[9]*e[9]+e[10]*e[10];return Math.sqrt(Math.max(t,n,i))}makeTranslation(e,t,n){return e.isVector3?this.set(1,0,0,e.x,0,1,0,e.y,0,0,1,e.z,0,0,0,1):this.set(1,0,0,e,0,1,0,t,0,0,1,n,0,0,0,1),this}makeRotationX(e){let t=Math.cos(e),n=Math.sin(e);return this.set(1,0,0,0,0,t,-n,0,0,n,t,0,0,0,0,1),this}makeRotationY(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,0,n,0,0,1,0,0,-n,0,t,0,0,0,0,1),this}makeRotationZ(e){let t=Math.cos(e),n=Math.sin(e);return this.set(t,-n,0,0,n,t,0,0,0,0,1,0,0,0,0,1),this}makeRotationAxis(e,t){let n=Math.cos(t),i=Math.sin(t),r=1-n,o=e.x,a=e.y,c=e.z,l=r*o,h=r*a;return this.set(l*o+n,l*a-i*c,l*c+i*a,0,l*a+i*c,h*a+n,h*c-i*o,0,l*c-i*a,h*c+i*o,r*c*c+n,0,0,0,0,1),this}makeScale(e,t,n){return this.set(e,0,0,0,0,t,0,0,0,0,n,0,0,0,0,1),this}makeShear(e,t,n,i,r,o){return this.set(1,n,r,0,e,1,o,0,t,i,1,0,0,0,0,1),this}compose(e,t,n){let i=this.elements,r=t._x,o=t._y,a=t._z,c=t._w,l=r+r,h=o+o,u=a+a,d=r*l,p=r*h,g=r*u,_=o*h,m=o*u,f=a*u,v=c*l,S=c*h,x=c*u,P=n.x,T=n.y,w=n.z;return i[0]=(1-(_+f))*P,i[1]=(p+x)*P,i[2]=(g-S)*P,i[3]=0,i[4]=(p-x)*T,i[5]=(1-(d+f))*T,i[6]=(m+v)*T,i[7]=0,i[8]=(g+S)*w,i[9]=(m-v)*w,i[10]=(1-(d+_))*w,i[11]=0,i[12]=e.x,i[13]=e.y,i[14]=e.z,i[15]=1,this}decompose(e,t,n){let i=this.elements,r=Zs.set(i[0],i[1],i[2]).length(),o=Zs.set(i[4],i[5],i[6]).length(),a=Zs.set(i[8],i[9],i[10]).length();this.determinant()<0&&(r=-r),e.x=i[12],e.y=i[13],e.z=i[14],Wn.copy(this);let l=1/r,h=1/o,u=1/a;return Wn.elements[0]*=l,Wn.elements[1]*=l,Wn.elements[2]*=l,Wn.elements[4]*=h,Wn.elements[5]*=h,Wn.elements[6]*=h,Wn.elements[8]*=u,Wn.elements[9]*=u,Wn.elements[10]*=u,t.setFromRotationMatrix(Wn),n.x=r,n.y=o,n.z=a,this}makePerspective(e,t,n,i,r,o,a=oi){let c=this.elements,l=2*r/(t-e),h=2*r/(n-i),u=(t+e)/(t-e),d=(n+i)/(n-i),p,g;if(a===oi)p=-(o+r)/(o-r),g=-2*o*r/(o-r);else if(a===Yr)p=-o/(o-r),g=-o*r/(o-r);else throw new Error("THREE.Matrix4.makePerspective(): Invalid coordinate system: "+a);return c[0]=l,c[4]=0,c[8]=u,c[12]=0,c[1]=0,c[5]=h,c[9]=d,c[13]=0,c[2]=0,c[6]=0,c[10]=p,c[14]=g,c[3]=0,c[7]=0,c[11]=-1,c[15]=0,this}makeOrthographic(e,t,n,i,r,o,a=oi){let c=this.elements,l=1/(t-e),h=1/(n-i),u=1/(o-r),d=(t+e)*l,p=(n+i)*h,g,_;if(a===oi)g=(o+r)*u,_=-2*u;else if(a===Yr)g=r*u,_=-1*u;else throw new Error("THREE.Matrix4.makeOrthographic(): Invalid coordinate system: "+a);return c[0]=2*l,c[4]=0,c[8]=0,c[12]=-d,c[1]=0,c[5]=2*h,c[9]=0,c[13]=-p,c[2]=0,c[6]=0,c[10]=_,c[14]=-g,c[3]=0,c[7]=0,c[11]=0,c[15]=1,this}equals(e){let t=this.elements,n=e.elements;for(let i=0;i<16;i++)if(t[i]!==n[i])return!1;return!0}fromArray(e,t=0){for(let n=0;n<16;n++)this.elements[n]=e[n+t];return this}toArray(e=[],t=0){let n=this.elements;return e[t]=n[0],e[t+1]=n[1],e[t+2]=n[2],e[t+3]=n[3],e[t+4]=n[4],e[t+5]=n[5],e[t+6]=n[6],e[t+7]=n[7],e[t+8]=n[8],e[t+9]=n[9],e[t+10]=n[10],e[t+11]=n[11],e[t+12]=n[12],e[t+13]=n[13],e[t+14]=n[14],e[t+15]=n[15],e}},Zs=new D,Wn=new Ze,Wp=new D(0,0,0),Xp=new D(1,1,1),Wi=new D,ko=new D,Rn=new D,pu=new Ze,mu=new Tn,Kn=class s{constructor(e=0,t=0,n=0,i=s.DEFAULT_ORDER){this.isEuler=!0,this._x=e,this._y=t,this._z=n,this._order=i}get x(){return this._x}set x(e){this._x=e,this._onChangeCallback()}get y(){return this._y}set y(e){this._y=e,this._onChangeCallback()}get z(){return this._z}set z(e){this._z=e,this._onChangeCallback()}get order(){return this._order}set order(e){this._order=e,this._onChangeCallback()}set(e,t,n,i=this._order){return this._x=e,this._y=t,this._z=n,this._order=i,this._onChangeCallback(),this}clone(){return new this.constructor(this._x,this._y,this._z,this._order)}copy(e){return this._x=e._x,this._y=e._y,this._z=e._z,this._order=e._order,this._onChangeCallback(),this}setFromRotationMatrix(e,t=this._order,n=!0){let i=e.elements,r=i[0],o=i[4],a=i[8],c=i[1],l=i[5],h=i[9],u=i[2],d=i[6],p=i[10];switch(t){case"XYZ":this._y=Math.asin(ht(a,-1,1)),Math.abs(a)<.9999999?(this._x=Math.atan2(-h,p),this._z=Math.atan2(-o,r)):(this._x=Math.atan2(d,l),this._z=0);break;case"YXZ":this._x=Math.asin(-ht(h,-1,1)),Math.abs(h)<.9999999?(this._y=Math.atan2(a,p),this._z=Math.atan2(c,l)):(this._y=Math.atan2(-u,r),this._z=0);break;case"ZXY":this._x=Math.asin(ht(d,-1,1)),Math.abs(d)<.9999999?(this._y=Math.atan2(-u,p),this._z=Math.atan2(-o,l)):(this._y=0,this._z=Math.atan2(c,r));break;case"ZYX":this._y=Math.asin(-ht(u,-1,1)),Math.abs(u)<.9999999?(this._x=Math.atan2(d,p),this._z=Math.atan2(c,r)):(this._x=0,this._z=Math.atan2(-o,l));break;case"YZX":this._z=Math.asin(ht(c,-1,1)),Math.abs(c)<.9999999?(this._x=Math.atan2(-h,l),this._y=Math.atan2(-u,r)):(this._x=0,this._y=Math.atan2(a,p));break;case"XZY":this._z=Math.asin(-ht(o,-1,1)),Math.abs(o)<.9999999?(this._x=Math.atan2(d,l),this._y=Math.atan2(a,r)):(this._x=Math.atan2(-h,p),this._y=0);break;default:console.warn("THREE.Euler: .setFromRotationMatrix() encountered an unknown order: "+t)}return this._order=t,n===!0&&this._onChangeCallback(),this}setFromQuaternion(e,t,n){return pu.makeRotationFromQuaternion(e),this.setFromRotationMatrix(pu,t,n)}setFromVector3(e,t=this._order){return this.set(e.x,e.y,e.z,t)}reorder(e){return mu.setFromEuler(this),this.setFromQuaternion(mu,e)}equals(e){return e._x===this._x&&e._y===this._y&&e._z===this._z&&e._order===this._order}fromArray(e){return this._x=e[0],this._y=e[1],this._z=e[2],e[3]!==void 0&&(this._order=e[3]),this._onChangeCallback(),this}toArray(e=[],t=0){return e[t]=this._x,e[t+1]=this._y,e[t+2]=this._z,e[t+3]=this._order,e}_onChange(e){return this._onChangeCallback=e,this}_onChangeCallback(){}*[Symbol.iterator](){yield this._x,yield this._y,yield this._z,yield this._order}};Kn.DEFAULT_ORDER="XYZ";var Zr=class{constructor(){this.mask=1}set(e){this.mask=(1<<e|0)>>>0}enable(e){this.mask|=1<<e|0}enableAll(){this.mask=-1}toggle(e){this.mask^=1<<e|0}disable(e){this.mask&=~(1<<e|0)}disableAll(){this.mask=0}test(e){return(this.mask&e.mask)!==0}isEnabled(e){return(this.mask&(1<<e|0))!==0}},Yp=0,gu=new D,Ks=new Tn,vi=new Ze,Go=new D,Ur=new D,qp=new D,Zp=new Tn,_u=new D(1,0,0),xu=new D(0,1,0),yu=new D(0,0,1),vu={type:"added"},Kp={type:"removed"},Js={type:"childadded",child:null},Jc={type:"childremoved",child:null},St=class s extends Ri{constructor(){super(),this.isObject3D=!0,Object.defineProperty(this,"id",{value:Yp++}),this.uuid=qn(),this.name="",this.type="Object3D",this.parent=null,this.children=[],this.up=s.DEFAULT_UP.clone();let e=new D,t=new Kn,n=new Tn,i=new D(1,1,1);function r(){n.setFromEuler(t,!1)}function o(){t.setFromQuaternion(n,void 0,!1)}t._onChange(r),n._onChange(o),Object.defineProperties(this,{position:{configurable:!0,enumerable:!0,value:e},rotation:{configurable:!0,enumerable:!0,value:t},quaternion:{configurable:!0,enumerable:!0,value:n},scale:{configurable:!0,enumerable:!0,value:i},modelViewMatrix:{value:new Ze},normalMatrix:{value:new Qe}}),this.matrix=new Ze,this.matrixWorld=new Ze,this.matrixAutoUpdate=s.DEFAULT_MATRIX_AUTO_UPDATE,this.matrixWorldAutoUpdate=s.DEFAULT_MATRIX_WORLD_AUTO_UPDATE,this.matrixWorldNeedsUpdate=!1,this.layers=new Zr,this.visible=!0,this.castShadow=!1,this.receiveShadow=!1,this.frustumCulled=!0,this.renderOrder=0,this.animations=[],this.userData={}}onBeforeShadow(){}onAfterShadow(){}onBeforeRender(){}onAfterRender(){}applyMatrix4(e){this.matrixAutoUpdate&&this.updateMatrix(),this.matrix.premultiply(e),this.matrix.decompose(this.position,this.quaternion,this.scale)}applyQuaternion(e){return this.quaternion.premultiply(e),this}setRotationFromAxisAngle(e,t){this.quaternion.setFromAxisAngle(e,t)}setRotationFromEuler(e){this.quaternion.setFromEuler(e,!0)}setRotationFromMatrix(e){this.quaternion.setFromRotationMatrix(e)}setRotationFromQuaternion(e){this.quaternion.copy(e)}rotateOnAxis(e,t){return Ks.setFromAxisAngle(e,t),this.quaternion.multiply(Ks),this}rotateOnWorldAxis(e,t){return Ks.setFromAxisAngle(e,t),this.quaternion.premultiply(Ks),this}rotateX(e){return this.rotateOnAxis(_u,e)}rotateY(e){return this.rotateOnAxis(xu,e)}rotateZ(e){return this.rotateOnAxis(yu,e)}translateOnAxis(e,t){return gu.copy(e).applyQuaternion(this.quaternion),this.position.add(gu.multiplyScalar(t)),this}translateX(e){return this.translateOnAxis(_u,e)}translateY(e){return this.translateOnAxis(xu,e)}translateZ(e){return this.translateOnAxis(yu,e)}localToWorld(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(this.matrixWorld)}worldToLocal(e){return this.updateWorldMatrix(!0,!1),e.applyMatrix4(vi.copy(this.matrixWorld).invert())}lookAt(e,t,n){e.isVector3?Go.copy(e):Go.set(e,t,n);let i=this.parent;this.updateWorldMatrix(!0,!1),Ur.setFromMatrixPosition(this.matrixWorld),this.isCamera||this.isLight?vi.lookAt(Ur,Go,this.up):vi.lookAt(Go,Ur,this.up),this.quaternion.setFromRotationMatrix(vi),i&&(vi.extractRotation(i.matrixWorld),Ks.setFromRotationMatrix(vi),this.quaternion.premultiply(Ks.invert()))}add(e){if(arguments.length>1){for(let t=0;t<arguments.length;t++)this.add(arguments[t]);return this}return e===this?(console.error("THREE.Object3D.add: object can't be added as a child of itself.",e),this):(e&&e.isObject3D?(e.removeFromParent(),e.parent=this,this.children.push(e),e.dispatchEvent(vu),Js.child=e,this.dispatchEvent(Js),Js.child=null):console.error("THREE.Object3D.add: object not an instance of THREE.Object3D.",e),this)}remove(e){if(arguments.length>1){for(let n=0;n<arguments.length;n++)this.remove(arguments[n]);return this}let t=this.children.indexOf(e);return t!==-1&&(e.parent=null,this.children.splice(t,1),e.dispatchEvent(Kp),Jc.child=e,this.dispatchEvent(Jc),Jc.child=null),this}removeFromParent(){let e=this.parent;return e!==null&&e.remove(this),this}clear(){return this.remove(...this.children)}attach(e){return this.updateWorldMatrix(!0,!1),vi.copy(this.matrixWorld).invert(),e.parent!==null&&(e.parent.updateWorldMatrix(!0,!1),vi.multiply(e.parent.matrixWorld)),e.applyMatrix4(vi),e.removeFromParent(),e.parent=this,this.children.push(e),e.updateWorldMatrix(!1,!0),e.dispatchEvent(vu),Js.child=e,this.dispatchEvent(Js),Js.child=null,this}getObjectById(e){return this.getObjectByProperty("id",e)}getObjectByName(e){return this.getObjectByProperty("name",e)}getObjectByProperty(e,t){if(this[e]===t)return this;for(let n=0,i=this.children.length;n<i;n++){let o=this.children[n].getObjectByProperty(e,t);if(o!==void 0)return o}}getObjectsByProperty(e,t,n=[]){this[e]===t&&n.push(this);let i=this.children;for(let r=0,o=i.length;r<o;r++)i[r].getObjectsByProperty(e,t,n);return n}getWorldPosition(e){return this.updateWorldMatrix(!0,!1),e.setFromMatrixPosition(this.matrixWorld)}getWorldQuaternion(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Ur,e,qp),e}getWorldScale(e){return this.updateWorldMatrix(!0,!1),this.matrixWorld.decompose(Ur,Zp,e),e}getWorldDirection(e){this.updateWorldMatrix(!0,!1);let t=this.matrixWorld.elements;return e.set(t[8],t[9],t[10]).normalize()}raycast(){}traverse(e){e(this);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverse(e)}traverseVisible(e){if(this.visible===!1)return;e(this);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].traverseVisible(e)}traverseAncestors(e){let t=this.parent;t!==null&&(e(t),t.traverseAncestors(e))}updateMatrix(){this.matrix.compose(this.position,this.quaternion,this.scale),this.matrixWorldNeedsUpdate=!0}updateMatrixWorld(e){this.matrixAutoUpdate&&this.updateMatrix(),(this.matrixWorldNeedsUpdate||e)&&(this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),this.matrixWorldNeedsUpdate=!1,e=!0);let t=this.children;for(let n=0,i=t.length;n<i;n++)t[n].updateMatrixWorld(e)}updateWorldMatrix(e,t){let n=this.parent;if(e===!0&&n!==null&&n.updateWorldMatrix(!0,!1),this.matrixAutoUpdate&&this.updateMatrix(),this.matrixWorldAutoUpdate===!0&&(this.parent===null?this.matrixWorld.copy(this.matrix):this.matrixWorld.multiplyMatrices(this.parent.matrixWorld,this.matrix)),t===!0){let i=this.children;for(let r=0,o=i.length;r<o;r++)i[r].updateWorldMatrix(!1,!0)}}toJSON(e){let t=e===void 0||typeof e=="string",n={};t&&(e={geometries:{},materials:{},textures:{},images:{},shapes:{},skeletons:{},animations:{},nodes:{}},n.metadata={version:4.6,type:"Object",generator:"Object3D.toJSON"});let i={};i.uuid=this.uuid,i.type=this.type,this.name!==""&&(i.name=this.name),this.castShadow===!0&&(i.castShadow=!0),this.receiveShadow===!0&&(i.receiveShadow=!0),this.visible===!1&&(i.visible=!1),this.frustumCulled===!1&&(i.frustumCulled=!1),this.renderOrder!==0&&(i.renderOrder=this.renderOrder),Object.keys(this.userData).length>0&&(i.userData=this.userData),i.layers=this.layers.mask,i.matrix=this.matrix.toArray(),i.up=this.up.toArray(),this.matrixAutoUpdate===!1&&(i.matrixAutoUpdate=!1),this.isInstancedMesh&&(i.type="InstancedMesh",i.count=this.count,i.instanceMatrix=this.instanceMatrix.toJSON(),this.instanceColor!==null&&(i.instanceColor=this.instanceColor.toJSON())),this.isBatchedMesh&&(i.type="BatchedMesh",i.perObjectFrustumCulled=this.perObjectFrustumCulled,i.sortObjects=this.sortObjects,i.drawRanges=this._drawRanges,i.reservedRanges=this._reservedRanges,i.visibility=this._visibility,i.active=this._active,i.bounds=this._bounds.map(a=>({boxInitialized:a.boxInitialized,boxMin:a.box.min.toArray(),boxMax:a.box.max.toArray(),sphereInitialized:a.sphereInitialized,sphereRadius:a.sphere.radius,sphereCenter:a.sphere.center.toArray()})),i.maxInstanceCount=this._maxInstanceCount,i.maxVertexCount=this._maxVertexCount,i.maxIndexCount=this._maxIndexCount,i.geometryInitialized=this._geometryInitialized,i.geometryCount=this._geometryCount,i.matricesTexture=this._matricesTexture.toJSON(e),this._colorsTexture!==null&&(i.colorsTexture=this._colorsTexture.toJSON(e)),this.boundingSphere!==null&&(i.boundingSphere={center:i.boundingSphere.center.toArray(),radius:i.boundingSphere.radius}),this.boundingBox!==null&&(i.boundingBox={min:i.boundingBox.min.toArray(),max:i.boundingBox.max.toArray()}));function r(a,c){return a[c.uuid]===void 0&&(a[c.uuid]=c.toJSON(e)),c.uuid}if(this.isScene)this.background&&(this.background.isColor?i.background=this.background.toJSON():this.background.isTexture&&(i.background=this.background.toJSON(e).uuid)),this.environment&&this.environment.isTexture&&this.environment.isRenderTargetTexture!==!0&&(i.environment=this.environment.toJSON(e).uuid);else if(this.isMesh||this.isLine||this.isPoints){i.geometry=r(e.geometries,this.geometry);let a=this.geometry.parameters;if(a!==void 0&&a.shapes!==void 0){let c=a.shapes;if(Array.isArray(c))for(let l=0,h=c.length;l<h;l++){let u=c[l];r(e.shapes,u)}else r(e.shapes,c)}}if(this.isSkinnedMesh&&(i.bindMode=this.bindMode,i.bindMatrix=this.bindMatrix.toArray(),this.skeleton!==void 0&&(r(e.skeletons,this.skeleton),i.skeleton=this.skeleton.uuid)),this.material!==void 0)if(Array.isArray(this.material)){let a=[];for(let c=0,l=this.material.length;c<l;c++)a.push(r(e.materials,this.material[c]));i.material=a}else i.material=r(e.materials,this.material);if(this.children.length>0){i.children=[];for(let a=0;a<this.children.length;a++)i.children.push(this.children[a].toJSON(e).object)}if(this.animations.length>0){i.animations=[];for(let a=0;a<this.animations.length;a++){let c=this.animations[a];i.animations.push(r(e.animations,c))}}if(t){let a=o(e.geometries),c=o(e.materials),l=o(e.textures),h=o(e.images),u=o(e.shapes),d=o(e.skeletons),p=o(e.animations),g=o(e.nodes);a.length>0&&(n.geometries=a),c.length>0&&(n.materials=c),l.length>0&&(n.textures=l),h.length>0&&(n.images=h),u.length>0&&(n.shapes=u),d.length>0&&(n.skeletons=d),p.length>0&&(n.animations=p),g.length>0&&(n.nodes=g)}return n.object=i,n;function o(a){let c=[];for(let l in a){let h=a[l];delete h.metadata,c.push(h)}return c}}clone(e){return new this.constructor().copy(this,e)}copy(e,t=!0){if(this.name=e.name,this.up.copy(e.up),this.position.copy(e.position),this.rotation.order=e.rotation.order,this.quaternion.copy(e.quaternion),this.scale.copy(e.scale),this.matrix.copy(e.matrix),this.matrixWorld.copy(e.matrixWorld),this.matrixAutoUpdate=e.matrixAutoUpdate,this.matrixWorldAutoUpdate=e.matrixWorldAutoUpdate,this.matrixWorldNeedsUpdate=e.matrixWorldNeedsUpdate,this.layers.mask=e.layers.mask,this.visible=e.visible,this.castShadow=e.castShadow,this.receiveShadow=e.receiveShadow,this.frustumCulled=e.frustumCulled,this.renderOrder=e.renderOrder,this.animations=e.animations.slice(),this.userData=JSON.parse(JSON.stringify(e.userData)),t===!0)for(let n=0;n<e.children.length;n++){let i=e.children[n];this.add(i.clone())}return this}};St.DEFAULT_UP=new D(0,1,0);St.DEFAULT_MATRIX_AUTO_UPDATE=!0;St.DEFAULT_MATRIX_WORLD_AUTO_UPDATE=!0;var Xn=new D,Mi=new D,$c=new D,bi=new D,$s=new D,js=new D,Mu=new D,jc=new D,Qc=new D,el=new D,tl=new _t,nl=new _t,il=new _t,Ei=class s{constructor(e=new D,t=new D,n=new D){this.a=e,this.b=t,this.c=n}static getNormal(e,t,n,i){i.subVectors(n,t),Xn.subVectors(e,t),i.cross(Xn);let r=i.lengthSq();return r>0?i.multiplyScalar(1/Math.sqrt(r)):i.set(0,0,0)}static getBarycoord(e,t,n,i,r){Xn.subVectors(i,t),Mi.subVectors(n,t),$c.subVectors(e,t);let o=Xn.dot(Xn),a=Xn.dot(Mi),c=Xn.dot($c),l=Mi.dot(Mi),h=Mi.dot($c),u=o*l-a*a;if(u===0)return r.set(0,0,0),null;let d=1/u,p=(l*c-a*h)*d,g=(o*h-a*c)*d;return r.set(1-p-g,g,p)}static containsPoint(e,t,n,i){return this.getBarycoord(e,t,n,i,bi)===null?!1:bi.x>=0&&bi.y>=0&&bi.x+bi.y<=1}static getInterpolation(e,t,n,i,r,o,a,c){return this.getBarycoord(e,t,n,i,bi)===null?(c.x=0,c.y=0,"z"in c&&(c.z=0),"w"in c&&(c.w=0),null):(c.setScalar(0),c.addScaledVector(r,bi.x),c.addScaledVector(o,bi.y),c.addScaledVector(a,bi.z),c)}static getInterpolatedAttribute(e,t,n,i,r,o){return tl.setScalar(0),nl.setScalar(0),il.setScalar(0),tl.fromBufferAttribute(e,t),nl.fromBufferAttribute(e,n),il.fromBufferAttribute(e,i),o.setScalar(0),o.addScaledVector(tl,r.x),o.addScaledVector(nl,r.y),o.addScaledVector(il,r.z),o}static isFrontFacing(e,t,n,i){return Xn.subVectors(n,t),Mi.subVectors(e,t),Xn.cross(Mi).dot(i)<0}set(e,t,n){return this.a.copy(e),this.b.copy(t),this.c.copy(n),this}setFromPointsAndIndices(e,t,n,i){return this.a.copy(e[t]),this.b.copy(e[n]),this.c.copy(e[i]),this}setFromAttributeAndIndices(e,t,n,i){return this.a.fromBufferAttribute(e,t),this.b.fromBufferAttribute(e,n),this.c.fromBufferAttribute(e,i),this}clone(){return new this.constructor().copy(this)}copy(e){return this.a.copy(e.a),this.b.copy(e.b),this.c.copy(e.c),this}getArea(){return Xn.subVectors(this.c,this.b),Mi.subVectors(this.a,this.b),Xn.cross(Mi).length()*.5}getMidpoint(e){return e.addVectors(this.a,this.b).add(this.c).multiplyScalar(1/3)}getNormal(e){return s.getNormal(this.a,this.b,this.c,e)}getPlane(e){return e.setFromCoplanarPoints(this.a,this.b,this.c)}getBarycoord(e,t){return s.getBarycoord(e,this.a,this.b,this.c,t)}getInterpolation(e,t,n,i,r){return s.getInterpolation(e,this.a,this.b,this.c,t,n,i,r)}containsPoint(e){return s.containsPoint(e,this.a,this.b,this.c)}isFrontFacing(e){return s.isFrontFacing(this.a,this.b,this.c,e)}intersectsBox(e){return e.intersectsTriangle(this)}closestPointToPoint(e,t){let n=this.a,i=this.b,r=this.c,o,a;$s.subVectors(i,n),js.subVectors(r,n),jc.subVectors(e,n);let c=$s.dot(jc),l=js.dot(jc);if(c<=0&&l<=0)return t.copy(n);Qc.subVectors(e,i);let h=$s.dot(Qc),u=js.dot(Qc);if(h>=0&&u<=h)return t.copy(i);let d=c*u-h*l;if(d<=0&&c>=0&&h<=0)return o=c/(c-h),t.copy(n).addScaledVector($s,o);el.subVectors(e,r);let p=$s.dot(el),g=js.dot(el);if(g>=0&&p<=g)return t.copy(r);let _=p*l-c*g;if(_<=0&&l>=0&&g<=0)return a=l/(l-g),t.copy(n).addScaledVector(js,a);let m=h*g-p*u;if(m<=0&&u-h>=0&&p-g>=0)return Mu.subVectors(r,i),a=(u-h)/(u-h+(p-g)),t.copy(i).addScaledVector(Mu,a);let f=1/(m+_+d);return o=_*f,a=d*f,t.copy(n).addScaledVector($s,o).addScaledVector(js,a)}equals(e){return e.a.equals(this.a)&&e.b.equals(this.b)&&e.c.equals(this.c)}},Bd={aliceblue:15792383,antiquewhite:16444375,aqua:65535,aquamarine:8388564,azure:15794175,beige:16119260,bisque:16770244,black:0,blanchedalmond:16772045,blue:255,blueviolet:9055202,brown:10824234,burlywood:14596231,cadetblue:6266528,chartreuse:8388352,chocolate:13789470,coral:16744272,cornflowerblue:6591981,cornsilk:16775388,crimson:14423100,cyan:65535,darkblue:139,darkcyan:35723,darkgoldenrod:12092939,darkgray:11119017,darkgreen:25600,darkgrey:11119017,darkkhaki:12433259,darkmagenta:9109643,darkolivegreen:5597999,darkorange:16747520,darkorchid:10040012,darkred:9109504,darksalmon:15308410,darkseagreen:9419919,darkslateblue:4734347,darkslategray:3100495,darkslategrey:3100495,darkturquoise:52945,darkviolet:9699539,deeppink:16716947,deepskyblue:49151,dimgray:6908265,dimgrey:6908265,dodgerblue:2003199,firebrick:11674146,floralwhite:16775920,forestgreen:2263842,fuchsia:16711935,gainsboro:14474460,ghostwhite:16316671,gold:16766720,goldenrod:14329120,gray:8421504,green:32768,greenyellow:11403055,grey:8421504,honeydew:15794160,hotpink:16738740,indianred:13458524,indigo:4915330,ivory:16777200,khaki:15787660,lavender:15132410,lavenderblush:16773365,lawngreen:8190976,lemonchiffon:16775885,lightblue:11393254,lightcoral:15761536,lightcyan:14745599,lightgoldenrodyellow:16448210,lightgray:13882323,lightgreen:9498256,lightgrey:13882323,lightpink:16758465,lightsalmon:16752762,lightseagreen:2142890,lightskyblue:8900346,lightslategray:7833753,lightslategrey:7833753,lightsteelblue:11584734,lightyellow:16777184,lime:65280,limegreen:3329330,linen:16445670,magenta:16711935,maroon:8388608,mediumaquamarine:6737322,mediumblue:205,mediumorchid:12211667,mediumpurple:9662683,mediumseagreen:3978097,mediumslateblue:8087790,mediumspringgreen:64154,mediumturquoise:4772300,mediumvioletred:13047173,midnightblue:1644912,mintcream:16121850,mistyrose:16770273,moccasin:16770229,navajowhite:16768685,navy:128,oldlace:16643558,olive:8421376,olivedrab:7048739,orange:16753920,orangered:16729344,orchid:14315734,palegoldenrod:15657130,palegreen:10025880,paleturquoise:11529966,palevioletred:14381203,papayawhip:16773077,peachpuff:16767673,peru:13468991,pink:16761035,plum:14524637,powderblue:11591910,purple:8388736,rebeccapurple:6697881,red:16711680,rosybrown:12357519,royalblue:4286945,saddlebrown:9127187,salmon:16416882,sandybrown:16032864,seagreen:3050327,seashell:16774638,sienna:10506797,silver:12632256,skyblue:8900331,slateblue:6970061,slategray:7372944,slategrey:7372944,snow:16775930,springgreen:65407,steelblue:4620980,tan:13808780,teal:32896,thistle:14204888,tomato:16737095,turquoise:4251856,violet:15631086,wheat:16113331,white:16777215,whitesmoke:16119285,yellow:16776960,yellowgreen:10145074},Xi={h:0,s:0,l:0},Vo={h:0,s:0,l:0};function sl(s,e,t){return t<0&&(t+=1),t>1&&(t-=1),t<1/6?s+(e-s)*6*t:t<1/2?e:t<2/3?s+(e-s)*6*(2/3-t):s}var ge=class{constructor(e,t,n){return this.isColor=!0,this.r=1,this.g=1,this.b=1,this.set(e,t,n)}set(e,t,n){if(t===void 0&&n===void 0){let i=e;i&&i.isColor?this.copy(i):typeof i=="number"?this.setHex(i):typeof i=="string"&&this.setStyle(i)}else this.setRGB(e,t,n);return this}setScalar(e){return this.r=e,this.g=e,this.b=e,this}setHex(e,t=ct){return e=Math.floor(e),this.r=(e>>16&255)/255,this.g=(e>>8&255)/255,this.b=(e&255)/255,ft.toWorkingColorSpace(this,t),this}setRGB(e,t,n,i=ft.workingColorSpace){return this.r=e,this.g=t,this.b=n,ft.toWorkingColorSpace(this,i),this}setHSL(e,t,n,i=ft.workingColorSpace){if(e=Wl(e,1),t=ht(t,0,1),n=ht(n,0,1),t===0)this.r=this.g=this.b=n;else{let r=n<=.5?n*(1+t):n+t-n*t,o=2*n-r;this.r=sl(o,r,e+1/3),this.g=sl(o,r,e),this.b=sl(o,r,e-1/3)}return ft.toWorkingColorSpace(this,i),this}setStyle(e,t=ct){function n(r){r!==void 0&&parseFloat(r)<1&&console.warn("THREE.Color: Alpha component of "+e+" will be ignored.")}let i;if(i=/^(\w+)\(([^\)]*)\)/.exec(e)){let r,o=i[1],a=i[2];switch(o){case"rgb":case"rgba":if(r=/^\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(255,parseInt(r[1],10))/255,Math.min(255,parseInt(r[2],10))/255,Math.min(255,parseInt(r[3],10))/255,t);if(r=/^\s*(\d+)\%\s*,\s*(\d+)\%\s*,\s*(\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setRGB(Math.min(100,parseInt(r[1],10))/100,Math.min(100,parseInt(r[2],10))/100,Math.min(100,parseInt(r[3],10))/100,t);break;case"hsl":case"hsla":if(r=/^\s*(\d*\.?\d+)\s*,\s*(\d*\.?\d+)\%\s*,\s*(\d*\.?\d+)\%\s*(?:,\s*(\d*\.?\d+)\s*)?$/.exec(a))return n(r[4]),this.setHSL(parseFloat(r[1])/360,parseFloat(r[2])/100,parseFloat(r[3])/100,t);break;default:console.warn("THREE.Color: Unknown color model "+e)}}else if(i=/^\#([A-Fa-f\d]+)$/.exec(e)){let r=i[1],o=r.length;if(o===3)return this.setRGB(parseInt(r.charAt(0),16)/15,parseInt(r.charAt(1),16)/15,parseInt(r.charAt(2),16)/15,t);if(o===6)return this.setHex(parseInt(r,16),t);console.warn("THREE.Color: Invalid hex color "+e)}else if(e&&e.length>0)return this.setColorName(e,t);return this}setColorName(e,t=ct){let n=Bd[e.toLowerCase()];return n!==void 0?this.setHex(n,t):console.warn("THREE.Color: Unknown color "+e),this}clone(){return new this.constructor(this.r,this.g,this.b)}copy(e){return this.r=e.r,this.g=e.g,this.b=e.b,this}copySRGBToLinear(e){return this.r=wi(e.r),this.g=wi(e.g),this.b=wi(e.b),this}copyLinearToSRGB(e){return this.r=ar(e.r),this.g=ar(e.g),this.b=ar(e.b),this}convertSRGBToLinear(){return this.copySRGBToLinear(this),this}convertLinearToSRGB(){return this.copyLinearToSRGB(this),this}getHex(e=ct){return ft.fromWorkingColorSpace(fn.copy(this),e),Math.round(ht(fn.r*255,0,255))*65536+Math.round(ht(fn.g*255,0,255))*256+Math.round(ht(fn.b*255,0,255))}getHexString(e=ct){return("000000"+this.getHex(e).toString(16)).slice(-6)}getHSL(e,t=ft.workingColorSpace){ft.fromWorkingColorSpace(fn.copy(this),t);let n=fn.r,i=fn.g,r=fn.b,o=Math.max(n,i,r),a=Math.min(n,i,r),c,l,h=(a+o)/2;if(a===o)c=0,l=0;else{let u=o-a;switch(l=h<=.5?u/(o+a):u/(2-o-a),o){case n:c=(i-r)/u+(i<r?6:0);break;case i:c=(r-n)/u+2;break;case r:c=(n-i)/u+4;break}c/=6}return e.h=c,e.s=l,e.l=h,e}getRGB(e,t=ft.workingColorSpace){return ft.fromWorkingColorSpace(fn.copy(this),t),e.r=fn.r,e.g=fn.g,e.b=fn.b,e}getStyle(e=ct){ft.fromWorkingColorSpace(fn.copy(this),e);let t=fn.r,n=fn.g,i=fn.b;return e!==ct?`color(${e} ${t.toFixed(3)} ${n.toFixed(3)} ${i.toFixed(3)})`:`rgb(${Math.round(t*255)},${Math.round(n*255)},${Math.round(i*255)})`}offsetHSL(e,t,n){return this.getHSL(Xi),this.setHSL(Xi.h+e,Xi.s+t,Xi.l+n)}add(e){return this.r+=e.r,this.g+=e.g,this.b+=e.b,this}addColors(e,t){return this.r=e.r+t.r,this.g=e.g+t.g,this.b=e.b+t.b,this}addScalar(e){return this.r+=e,this.g+=e,this.b+=e,this}sub(e){return this.r=Math.max(0,this.r-e.r),this.g=Math.max(0,this.g-e.g),this.b=Math.max(0,this.b-e.b),this}multiply(e){return this.r*=e.r,this.g*=e.g,this.b*=e.b,this}multiplyScalar(e){return this.r*=e,this.g*=e,this.b*=e,this}lerp(e,t){return this.r+=(e.r-this.r)*t,this.g+=(e.g-this.g)*t,this.b+=(e.b-this.b)*t,this}lerpColors(e,t,n){return this.r=e.r+(t.r-e.r)*n,this.g=e.g+(t.g-e.g)*n,this.b=e.b+(t.b-e.b)*n,this}lerpHSL(e,t){this.getHSL(Xi),e.getHSL(Vo);let n=Wr(Xi.h,Vo.h,t),i=Wr(Xi.s,Vo.s,t),r=Wr(Xi.l,Vo.l,t);return this.setHSL(n,i,r),this}setFromVector3(e){return this.r=e.x,this.g=e.y,this.b=e.z,this}applyMatrix3(e){let t=this.r,n=this.g,i=this.b,r=e.elements;return this.r=r[0]*t+r[3]*n+r[6]*i,this.g=r[1]*t+r[4]*n+r[7]*i,this.b=r[2]*t+r[5]*n+r[8]*i,this}equals(e){return e.r===this.r&&e.g===this.g&&e.b===this.b}fromArray(e,t=0){return this.r=e[t],this.g=e[t+1],this.b=e[t+2],this}toArray(e=[],t=0){return e[t]=this.r,e[t+1]=this.g,e[t+2]=this.b,e}fromBufferAttribute(e,t){return this.r=e.getX(t),this.g=e.getY(t),this.b=e.getZ(t),this}toJSON(){return this.getHex()}*[Symbol.iterator](){yield this.r,yield this.g,yield this.b}},fn=new ge;ge.NAMES=Bd;var Jp=0,bn=class extends Ri{constructor(){super(),this.isMaterial=!0,Object.defineProperty(this,"id",{value:Jp++}),this.uuid=qn(),this.name="",this.type="Material",this.blending=ds,this.side=Zn,this.vertexColors=!1,this.opacity=1,this.transparent=!1,this.alphaHash=!1,this.blendSrc=ha,this.blendDst=ua,this.blendEquation=qi,this.blendSrcAlpha=null,this.blendDstAlpha=null,this.blendEquationAlpha=null,this.blendColor=new ge(0,0,0),this.blendAlpha=0,this.depthFunc=fs,this.depthTest=!0,this.depthWrite=!0,this.stencilWriteMask=255,this.stencilFunc=xl,this.stencilRef=0,this.stencilFuncMask=255,this.stencilFail=hs,this.stencilZFail=hs,this.stencilZPass=hs,this.stencilWrite=!1,this.clippingPlanes=null,this.clipIntersection=!1,this.clipShadows=!1,this.shadowSide=null,this.colorWrite=!0,this.precision=null,this.polygonOffset=!1,this.polygonOffsetFactor=0,this.polygonOffsetUnits=0,this.dithering=!1,this.alphaToCoverage=!1,this.premultipliedAlpha=!1,this.forceSinglePass=!1,this.visible=!0,this.toneMapped=!0,this.userData={},this.version=0,this._alphaTest=0}get alphaTest(){return this._alphaTest}set alphaTest(e){this._alphaTest>0!=e>0&&this.version++,this._alphaTest=e}onBeforeRender(){}onBeforeCompile(){}customProgramCacheKey(){return this.onBeforeCompile.toString()}setValues(e){if(e!==void 0)for(let t in e){let n=e[t];if(n===void 0){console.warn(`THREE.Material: parameter '${t}' has value of undefined.`);continue}let i=this[t];if(i===void 0){console.warn(`THREE.Material: '${t}' is not a property of THREE.${this.type}.`);continue}i&&i.isColor?i.set(n):i&&i.isVector3&&n&&n.isVector3?i.copy(n):this[t]=n}}toJSON(e){let t=e===void 0||typeof e=="string";t&&(e={textures:{},images:{}});let n={metadata:{version:4.6,type:"Material",generator:"Material.toJSON"}};n.uuid=this.uuid,n.type=this.type,this.name!==""&&(n.name=this.name),this.color&&this.color.isColor&&(n.color=this.color.getHex()),this.roughness!==void 0&&(n.roughness=this.roughness),this.metalness!==void 0&&(n.metalness=this.metalness),this.sheen!==void 0&&(n.sheen=this.sheen),this.sheenColor&&this.sheenColor.isColor&&(n.sheenColor=this.sheenColor.getHex()),this.sheenRoughness!==void 0&&(n.sheenRoughness=this.sheenRoughness),this.emissive&&this.emissive.isColor&&(n.emissive=this.emissive.getHex()),this.emissiveIntensity!==void 0&&this.emissiveIntensity!==1&&(n.emissiveIntensity=this.emissiveIntensity),this.specular&&this.specular.isColor&&(n.specular=this.specular.getHex()),this.specularIntensity!==void 0&&(n.specularIntensity=this.specularIntensity),this.specularColor&&this.specularColor.isColor&&(n.specularColor=this.specularColor.getHex()),this.shininess!==void 0&&(n.shininess=this.shininess),this.clearcoat!==void 0&&(n.clearcoat=this.clearcoat),this.clearcoatRoughness!==void 0&&(n.clearcoatRoughness=this.clearcoatRoughness),this.clearcoatMap&&this.clearcoatMap.isTexture&&(n.clearcoatMap=this.clearcoatMap.toJSON(e).uuid),this.clearcoatRoughnessMap&&this.clearcoatRoughnessMap.isTexture&&(n.clearcoatRoughnessMap=this.clearcoatRoughnessMap.toJSON(e).uuid),this.clearcoatNormalMap&&this.clearcoatNormalMap.isTexture&&(n.clearcoatNormalMap=this.clearcoatNormalMap.toJSON(e).uuid,n.clearcoatNormalScale=this.clearcoatNormalScale.toArray()),this.dispersion!==void 0&&(n.dispersion=this.dispersion),this.iridescence!==void 0&&(n.iridescence=this.iridescence),this.iridescenceIOR!==void 0&&(n.iridescenceIOR=this.iridescenceIOR),this.iridescenceThicknessRange!==void 0&&(n.iridescenceThicknessRange=this.iridescenceThicknessRange),this.iridescenceMap&&this.iridescenceMap.isTexture&&(n.iridescenceMap=this.iridescenceMap.toJSON(e).uuid),this.iridescenceThicknessMap&&this.iridescenceThicknessMap.isTexture&&(n.iridescenceThicknessMap=this.iridescenceThicknessMap.toJSON(e).uuid),this.anisotropy!==void 0&&(n.anisotropy=this.anisotropy),this.anisotropyRotation!==void 0&&(n.anisotropyRotation=this.anisotropyRotation),this.anisotropyMap&&this.anisotropyMap.isTexture&&(n.anisotropyMap=this.anisotropyMap.toJSON(e).uuid),this.map&&this.map.isTexture&&(n.map=this.map.toJSON(e).uuid),this.matcap&&this.matcap.isTexture&&(n.matcap=this.matcap.toJSON(e).uuid),this.alphaMap&&this.alphaMap.isTexture&&(n.alphaMap=this.alphaMap.toJSON(e).uuid),this.lightMap&&this.lightMap.isTexture&&(n.lightMap=this.lightMap.toJSON(e).uuid,n.lightMapIntensity=this.lightMapIntensity),this.aoMap&&this.aoMap.isTexture&&(n.aoMap=this.aoMap.toJSON(e).uuid,n.aoMapIntensity=this.aoMapIntensity),this.bumpMap&&this.bumpMap.isTexture&&(n.bumpMap=this.bumpMap.toJSON(e).uuid,n.bumpScale=this.bumpScale),this.normalMap&&this.normalMap.isTexture&&(n.normalMap=this.normalMap.toJSON(e).uuid,n.normalMapType=this.normalMapType,n.normalScale=this.normalScale.toArray()),this.displacementMap&&this.displacementMap.isTexture&&(n.displacementMap=this.displacementMap.toJSON(e).uuid,n.displacementScale=this.displacementScale,n.displacementBias=this.displacementBias),this.roughnessMap&&this.roughnessMap.isTexture&&(n.roughnessMap=this.roughnessMap.toJSON(e).uuid),this.metalnessMap&&this.metalnessMap.isTexture&&(n.metalnessMap=this.metalnessMap.toJSON(e).uuid),this.emissiveMap&&this.emissiveMap.isTexture&&(n.emissiveMap=this.emissiveMap.toJSON(e).uuid),this.specularMap&&this.specularMap.isTexture&&(n.specularMap=this.specularMap.toJSON(e).uuid),this.specularIntensityMap&&this.specularIntensityMap.isTexture&&(n.specularIntensityMap=this.specularIntensityMap.toJSON(e).uuid),this.specularColorMap&&this.specularColorMap.isTexture&&(n.specularColorMap=this.specularColorMap.toJSON(e).uuid),this.envMap&&this.envMap.isTexture&&(n.envMap=this.envMap.toJSON(e).uuid,this.combine!==void 0&&(n.combine=this.combine)),this.envMapRotation!==void 0&&(n.envMapRotation=this.envMapRotation.toArray()),this.envMapIntensity!==void 0&&(n.envMapIntensity=this.envMapIntensity),this.reflectivity!==void 0&&(n.reflectivity=this.reflectivity),this.refractionRatio!==void 0&&(n.refractionRatio=this.refractionRatio),this.gradientMap&&this.gradientMap.isTexture&&(n.gradientMap=this.gradientMap.toJSON(e).uuid),this.transmission!==void 0&&(n.transmission=this.transmission),this.transmissionMap&&this.transmissionMap.isTexture&&(n.transmissionMap=this.transmissionMap.toJSON(e).uuid),this.thickness!==void 0&&(n.thickness=this.thickness),this.thicknessMap&&this.thicknessMap.isTexture&&(n.thicknessMap=this.thicknessMap.toJSON(e).uuid),this.attenuationDistance!==void 0&&this.attenuationDistance!==1/0&&(n.attenuationDistance=this.attenuationDistance),this.attenuationColor!==void 0&&(n.attenuationColor=this.attenuationColor.getHex()),this.size!==void 0&&(n.size=this.size),this.shadowSide!==null&&(n.shadowSide=this.shadowSide),this.sizeAttenuation!==void 0&&(n.sizeAttenuation=this.sizeAttenuation),this.blending!==ds&&(n.blending=this.blending),this.side!==Zn&&(n.side=this.side),this.vertexColors===!0&&(n.vertexColors=!0),this.opacity<1&&(n.opacity=this.opacity),this.transparent===!0&&(n.transparent=!0),this.blendSrc!==ha&&(n.blendSrc=this.blendSrc),this.blendDst!==ua&&(n.blendDst=this.blendDst),this.blendEquation!==qi&&(n.blendEquation=this.blendEquation),this.blendSrcAlpha!==null&&(n.blendSrcAlpha=this.blendSrcAlpha),this.blendDstAlpha!==null&&(n.blendDstAlpha=this.blendDstAlpha),this.blendEquationAlpha!==null&&(n.blendEquationAlpha=this.blendEquationAlpha),this.blendColor&&this.blendColor.isColor&&(n.blendColor=this.blendColor.getHex()),this.blendAlpha!==0&&(n.blendAlpha=this.blendAlpha),this.depthFunc!==fs&&(n.depthFunc=this.depthFunc),this.depthTest===!1&&(n.depthTest=this.depthTest),this.depthWrite===!1&&(n.depthWrite=this.depthWrite),this.colorWrite===!1&&(n.colorWrite=this.colorWrite),this.stencilWriteMask!==255&&(n.stencilWriteMask=this.stencilWriteMask),this.stencilFunc!==xl&&(n.stencilFunc=this.stencilFunc),this.stencilRef!==0&&(n.stencilRef=this.stencilRef),this.stencilFuncMask!==255&&(n.stencilFuncMask=this.stencilFuncMask),this.stencilFail!==hs&&(n.stencilFail=this.stencilFail),this.stencilZFail!==hs&&(n.stencilZFail=this.stencilZFail),this.stencilZPass!==hs&&(n.stencilZPass=this.stencilZPass),this.stencilWrite===!0&&(n.stencilWrite=this.stencilWrite),this.rotation!==void 0&&this.rotation!==0&&(n.rotation=this.rotation),this.polygonOffset===!0&&(n.polygonOffset=!0),this.polygonOffsetFactor!==0&&(n.polygonOffsetFactor=this.polygonOffsetFactor),this.polygonOffsetUnits!==0&&(n.polygonOffsetUnits=this.polygonOffsetUnits),this.linewidth!==void 0&&this.linewidth!==1&&(n.linewidth=this.linewidth),this.dashSize!==void 0&&(n.dashSize=this.dashSize),this.gapSize!==void 0&&(n.gapSize=this.gapSize),this.scale!==void 0&&(n.scale=this.scale),this.dithering===!0&&(n.dithering=!0),this.alphaTest>0&&(n.alphaTest=this.alphaTest),this.alphaHash===!0&&(n.alphaHash=!0),this.alphaToCoverage===!0&&(n.alphaToCoverage=!0),this.premultipliedAlpha===!0&&(n.premultipliedAlpha=!0),this.forceSinglePass===!0&&(n.forceSinglePass=!0),this.wireframe===!0&&(n.wireframe=!0),this.wireframeLinewidth>1&&(n.wireframeLinewidth=this.wireframeLinewidth),this.wireframeLinecap!=="round"&&(n.wireframeLinecap=this.wireframeLinecap),this.wireframeLinejoin!=="round"&&(n.wireframeLinejoin=this.wireframeLinejoin),this.flatShading===!0&&(n.flatShading=!0),this.visible===!1&&(n.visible=!1),this.toneMapped===!1&&(n.toneMapped=!1),this.fog===!1&&(n.fog=!1),Object.keys(this.userData).length>0&&(n.userData=this.userData);function i(r){let o=[];for(let a in r){let c=r[a];delete c.metadata,o.push(c)}return o}if(t){let r=i(e.textures),o=i(e.images);r.length>0&&(n.textures=r),o.length>0&&(n.images=o)}return n}clone(){return new this.constructor().copy(this)}copy(e){this.name=e.name,this.blending=e.blending,this.side=e.side,this.vertexColors=e.vertexColors,this.opacity=e.opacity,this.transparent=e.transparent,this.blendSrc=e.blendSrc,this.blendDst=e.blendDst,this.blendEquation=e.blendEquation,this.blendSrcAlpha=e.blendSrcAlpha,this.blendDstAlpha=e.blendDstAlpha,this.blendEquationAlpha=e.blendEquationAlpha,this.blendColor.copy(e.blendColor),this.blendAlpha=e.blendAlpha,this.depthFunc=e.depthFunc,this.depthTest=e.depthTest,this.depthWrite=e.depthWrite,this.stencilWriteMask=e.stencilWriteMask,this.stencilFunc=e.stencilFunc,this.stencilRef=e.stencilRef,this.stencilFuncMask=e.stencilFuncMask,this.stencilFail=e.stencilFail,this.stencilZFail=e.stencilZFail,this.stencilZPass=e.stencilZPass,this.stencilWrite=e.stencilWrite;let t=e.clippingPlanes,n=null;if(t!==null){let i=t.length;n=new Array(i);for(let r=0;r!==i;++r)n[r]=t[r].clone()}return this.clippingPlanes=n,this.clipIntersection=e.clipIntersection,this.clipShadows=e.clipShadows,this.shadowSide=e.shadowSide,this.colorWrite=e.colorWrite,this.precision=e.precision,this.polygonOffset=e.polygonOffset,this.polygonOffsetFactor=e.polygonOffsetFactor,this.polygonOffsetUnits=e.polygonOffsetUnits,this.dithering=e.dithering,this.alphaTest=e.alphaTest,this.alphaHash=e.alphaHash,this.alphaToCoverage=e.alphaToCoverage,this.premultipliedAlpha=e.premultipliedAlpha,this.forceSinglePass=e.forceSinglePass,this.visible=e.visible,this.toneMapped=e.toneMapped,this.userData=JSON.parse(JSON.stringify(e.userData)),this}dispose(){this.dispatchEvent({type:"dispose"})}set needsUpdate(e){e===!0&&this.version++}onBuild(){console.warn("Material: onBuild() has been removed.")}},wt=class extends bn{constructor(e){super(),this.isMeshBasicMaterial=!0,this.type="MeshBasicMaterial",this.color=new ge(16777215),this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.specularMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Kn,this.combine=Cl,this.reflectivity=1,this.refractionRatio=.98,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.specularMap=e.specularMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.combine=e.combine,this.reflectivity=e.reflectivity,this.refractionRatio=e.refractionRatio,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.fog=e.fog,this}},Ti=$p();function $p(){let s=new ArrayBuffer(4),e=new Float32Array(s),t=new Uint32Array(s),n=new Uint32Array(512),i=new Uint32Array(512);for(let c=0;c<256;++c){let l=c-127;l<-27?(n[c]=0,n[c|256]=32768,i[c]=24,i[c|256]=24):l<-14?(n[c]=1024>>-l-14,n[c|256]=1024>>-l-14|32768,i[c]=-l-1,i[c|256]=-l-1):l<=15?(n[c]=l+15<<10,n[c|256]=l+15<<10|32768,i[c]=13,i[c|256]=13):l<128?(n[c]=31744,n[c|256]=64512,i[c]=24,i[c|256]=24):(n[c]=31744,n[c|256]=64512,i[c]=13,i[c|256]=13)}let r=new Uint32Array(2048),o=new Uint32Array(64),a=new Uint32Array(64);for(let c=1;c<1024;++c){let l=c<<13,h=0;for(;(l&8388608)===0;)l<<=1,h-=8388608;l&=-8388609,h+=947912704,r[c]=l|h}for(let c=1024;c<2048;++c)r[c]=939524096+(c-1024<<13);for(let c=1;c<31;++c)o[c]=c<<23;o[31]=1199570944,o[32]=2147483648;for(let c=33;c<63;++c)o[c]=2147483648+(c-32<<23);o[63]=3347054592;for(let c=1;c<64;++c)c!==32&&(a[c]=1024);return{floatView:e,uint32View:t,baseTable:n,shiftTable:i,mantissaTable:r,exponentTable:o,offsetTable:a}}function jp(s){Math.abs(s)>65504&&console.warn("THREE.DataUtils.toHalfFloat(): Value out of range."),s=ht(s,-65504,65504),Ti.floatView[0]=s;let e=Ti.uint32View[0],t=e>>23&511;return Ti.baseTable[t]+((e&8388607)>>Ti.shiftTable[t])}function Qp(s){let e=s>>10;return Ti.uint32View[0]=Ti.mantissaTable[Ti.offsetTable[e]+(s&1023)]+Ti.exponentTable[e],Ti.floatView[0]}var Zi=class{static toHalfFloat(e){return jp(e)}static fromHalfFloat(e){return Qp(e)}},Xt=new D,Wo=new ke,em=0,xt=class{constructor(e,t,n=!1){if(Array.isArray(e))throw new TypeError("THREE.BufferAttribute: array should be a Typed Array.");this.isBufferAttribute=!0,Object.defineProperty(this,"id",{value:em++}),this.name="",this.array=e,this.itemSize=t,this.count=e!==void 0?e.length/t:0,this.normalized=n,this.usage=da,this.updateRanges=[],this.gpuType=gn,this.version=0}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.name=e.name,this.array=new e.array.constructor(e.array),this.itemSize=e.itemSize,this.count=e.count,this.normalized=e.normalized,this.usage=e.usage,this.gpuType=e.gpuType,this}copyAt(e,t,n){e*=this.itemSize,n*=t.itemSize;for(let i=0,r=this.itemSize;i<r;i++)this.array[e+i]=t.array[n+i];return this}copyArray(e){return this.array.set(e),this}applyMatrix3(e){if(this.itemSize===2)for(let t=0,n=this.count;t<n;t++)Wo.fromBufferAttribute(this,t),Wo.applyMatrix3(e),this.setXY(t,Wo.x,Wo.y);else if(this.itemSize===3)for(let t=0,n=this.count;t<n;t++)Xt.fromBufferAttribute(this,t),Xt.applyMatrix3(e),this.setXYZ(t,Xt.x,Xt.y,Xt.z);return this}applyMatrix4(e){for(let t=0,n=this.count;t<n;t++)Xt.fromBufferAttribute(this,t),Xt.applyMatrix4(e),this.setXYZ(t,Xt.x,Xt.y,Xt.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)Xt.fromBufferAttribute(this,t),Xt.applyNormalMatrix(e),this.setXYZ(t,Xt.x,Xt.y,Xt.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)Xt.fromBufferAttribute(this,t),Xt.transformDirection(e),this.setXYZ(t,Xt.x,Xt.y,Xt.z);return this}set(e,t=0){return this.array.set(e,t),this}getComponent(e,t){let n=this.array[e*this.itemSize+t];return this.normalized&&(n=Yn(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=Tt(n,this.array)),this.array[e*this.itemSize+t]=n,this}getX(e){let t=this.array[e*this.itemSize];return this.normalized&&(t=Yn(t,this.array)),t}setX(e,t){return this.normalized&&(t=Tt(t,this.array)),this.array[e*this.itemSize]=t,this}getY(e){let t=this.array[e*this.itemSize+1];return this.normalized&&(t=Yn(t,this.array)),t}setY(e,t){return this.normalized&&(t=Tt(t,this.array)),this.array[e*this.itemSize+1]=t,this}getZ(e){let t=this.array[e*this.itemSize+2];return this.normalized&&(t=Yn(t,this.array)),t}setZ(e,t){return this.normalized&&(t=Tt(t,this.array)),this.array[e*this.itemSize+2]=t,this}getW(e){let t=this.array[e*this.itemSize+3];return this.normalized&&(t=Yn(t,this.array)),t}setW(e,t){return this.normalized&&(t=Tt(t,this.array)),this.array[e*this.itemSize+3]=t,this}setXY(e,t,n){return e*=this.itemSize,this.normalized&&(t=Tt(t,this.array),n=Tt(n,this.array)),this.array[e+0]=t,this.array[e+1]=n,this}setXYZ(e,t,n,i){return e*=this.itemSize,this.normalized&&(t=Tt(t,this.array),n=Tt(n,this.array),i=Tt(i,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this}setXYZW(e,t,n,i,r){return e*=this.itemSize,this.normalized&&(t=Tt(t,this.array),n=Tt(n,this.array),i=Tt(i,this.array),r=Tt(r,this.array)),this.array[e+0]=t,this.array[e+1]=n,this.array[e+2]=i,this.array[e+3]=r,this}onUpload(e){return this.onUploadCallback=e,this}clone(){return new this.constructor(this.array,this.itemSize).copy(this)}toJSON(){let e={itemSize:this.itemSize,type:this.array.constructor.name,array:Array.from(this.array),normalized:this.normalized};return this.name!==""&&(e.name=this.name),this.usage!==da&&(e.usage=this.usage),e}};var Kr=class extends xt{constructor(e,t,n){super(new Uint16Array(e),t,n)}};var Jr=class extends xt{constructor(e,t,n){super(new Uint32Array(e),t,n)}};var yt=class extends xt{constructor(e,t,n){super(new Float32Array(e),t,n)}},tm=0,Nn=new Ze,rl=new St,Qs=new D,Cn=new rn,Nr=new rn,sn=new D,Bt=class s extends Ri{constructor(){super(),this.isBufferGeometry=!0,Object.defineProperty(this,"id",{value:tm++}),this.uuid=qn(),this.name="",this.type="BufferGeometry",this.index=null,this.indirect=null,this.attributes={},this.morphAttributes={},this.morphTargetsRelative=!1,this.groups=[],this.boundingBox=null,this.boundingSphere=null,this.drawRange={start:0,count:1/0},this.userData={}}getIndex(){return this.index}setIndex(e){return Array.isArray(e)?this.index=new(Yl(e)?Jr:Kr)(e,1):this.index=e,this}setIndirect(e){return this.indirect=e,this}getIndirect(){return this.indirect}getAttribute(e){return this.attributes[e]}setAttribute(e,t){return this.attributes[e]=t,this}deleteAttribute(e){return delete this.attributes[e],this}hasAttribute(e){return this.attributes[e]!==void 0}addGroup(e,t,n=0){this.groups.push({start:e,count:t,materialIndex:n})}clearGroups(){this.groups=[]}setDrawRange(e,t){this.drawRange.start=e,this.drawRange.count=t}applyMatrix4(e){let t=this.attributes.position;t!==void 0&&(t.applyMatrix4(e),t.needsUpdate=!0);let n=this.attributes.normal;if(n!==void 0){let r=new Qe().getNormalMatrix(e);n.applyNormalMatrix(r),n.needsUpdate=!0}let i=this.attributes.tangent;return i!==void 0&&(i.transformDirection(e),i.needsUpdate=!0),this.boundingBox!==null&&this.computeBoundingBox(),this.boundingSphere!==null&&this.computeBoundingSphere(),this}applyQuaternion(e){return Nn.makeRotationFromQuaternion(e),this.applyMatrix4(Nn),this}rotateX(e){return Nn.makeRotationX(e),this.applyMatrix4(Nn),this}rotateY(e){return Nn.makeRotationY(e),this.applyMatrix4(Nn),this}rotateZ(e){return Nn.makeRotationZ(e),this.applyMatrix4(Nn),this}translate(e,t,n){return Nn.makeTranslation(e,t,n),this.applyMatrix4(Nn),this}scale(e,t,n){return Nn.makeScale(e,t,n),this.applyMatrix4(Nn),this}lookAt(e){return rl.lookAt(e),rl.updateMatrix(),this.applyMatrix4(rl.matrix),this}center(){return this.computeBoundingBox(),this.boundingBox.getCenter(Qs).negate(),this.translate(Qs.x,Qs.y,Qs.z),this}setFromPoints(e){let t=this.getAttribute("position");if(t===void 0){let n=[];for(let i=0,r=e.length;i<r;i++){let o=e[i];n.push(o.x,o.y,o.z||0)}this.setAttribute("position",new yt(n,3))}else{let n=Math.min(e.length,t.count);for(let i=0;i<n;i++){let r=e[i];t.setXYZ(i,r.x,r.y,r.z||0)}e.length>t.count&&console.warn("THREE.BufferGeometry: Buffer size too small for points data. Use .dispose() and create a new geometry."),t.needsUpdate=!0}return this}computeBoundingBox(){this.boundingBox===null&&(this.boundingBox=new rn);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingBox(): GLBufferAttribute requires a manual bounding box.",this),this.boundingBox.set(new D(-1/0,-1/0,-1/0),new D(1/0,1/0,1/0));return}if(e!==void 0){if(this.boundingBox.setFromBufferAttribute(e),t)for(let n=0,i=t.length;n<i;n++){let r=t[n];Cn.setFromBufferAttribute(r),this.morphTargetsRelative?(sn.addVectors(this.boundingBox.min,Cn.min),this.boundingBox.expandByPoint(sn),sn.addVectors(this.boundingBox.max,Cn.max),this.boundingBox.expandByPoint(sn)):(this.boundingBox.expandByPoint(Cn.min),this.boundingBox.expandByPoint(Cn.max))}}else this.boundingBox.makeEmpty();(isNaN(this.boundingBox.min.x)||isNaN(this.boundingBox.min.y)||isNaN(this.boundingBox.min.z))&&console.error('THREE.BufferGeometry.computeBoundingBox(): Computed min/max have NaN values. The "position" attribute is likely to have NaN values.',this)}computeBoundingSphere(){this.boundingSphere===null&&(this.boundingSphere=new An);let e=this.attributes.position,t=this.morphAttributes.position;if(e&&e.isGLBufferAttribute){console.error("THREE.BufferGeometry.computeBoundingSphere(): GLBufferAttribute requires a manual bounding sphere.",this),this.boundingSphere.set(new D,1/0);return}if(e){let n=this.boundingSphere.center;if(Cn.setFromBufferAttribute(e),t)for(let r=0,o=t.length;r<o;r++){let a=t[r];Nr.setFromBufferAttribute(a),this.morphTargetsRelative?(sn.addVectors(Cn.min,Nr.min),Cn.expandByPoint(sn),sn.addVectors(Cn.max,Nr.max),Cn.expandByPoint(sn)):(Cn.expandByPoint(Nr.min),Cn.expandByPoint(Nr.max))}Cn.getCenter(n);let i=0;for(let r=0,o=e.count;r<o;r++)sn.fromBufferAttribute(e,r),i=Math.max(i,n.distanceToSquared(sn));if(t)for(let r=0,o=t.length;r<o;r++){let a=t[r],c=this.morphTargetsRelative;for(let l=0,h=a.count;l<h;l++)sn.fromBufferAttribute(a,l),c&&(Qs.fromBufferAttribute(e,l),sn.add(Qs)),i=Math.max(i,n.distanceToSquared(sn))}this.boundingSphere.radius=Math.sqrt(i),isNaN(this.boundingSphere.radius)&&console.error('THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN. The "position" attribute is likely to have NaN values.',this)}}computeTangents(){let e=this.index,t=this.attributes;if(e===null||t.position===void 0||t.normal===void 0||t.uv===void 0){console.error("THREE.BufferGeometry: .computeTangents() failed. Missing required attributes (index, position, normal or uv)");return}let n=t.position,i=t.normal,r=t.uv;this.hasAttribute("tangent")===!1&&this.setAttribute("tangent",new xt(new Float32Array(4*n.count),4));let o=this.getAttribute("tangent"),a=[],c=[];for(let R=0;R<n.count;R++)a[R]=new D,c[R]=new D;let l=new D,h=new D,u=new D,d=new ke,p=new ke,g=new ke,_=new D,m=new D;function f(R,M,y){l.fromBufferAttribute(n,R),h.fromBufferAttribute(n,M),u.fromBufferAttribute(n,y),d.fromBufferAttribute(r,R),p.fromBufferAttribute(r,M),g.fromBufferAttribute(r,y),h.sub(l),u.sub(l),p.sub(d),g.sub(d);let I=1/(p.x*g.y-g.x*p.y);isFinite(I)&&(_.copy(h).multiplyScalar(g.y).addScaledVector(u,-p.y).multiplyScalar(I),m.copy(u).multiplyScalar(p.x).addScaledVector(h,-g.x).multiplyScalar(I),a[R].add(_),a[M].add(_),a[y].add(_),c[R].add(m),c[M].add(m),c[y].add(m))}let v=this.groups;v.length===0&&(v=[{start:0,count:e.count}]);for(let R=0,M=v.length;R<M;++R){let y=v[R],I=y.start,F=y.count;for(let U=I,O=I+F;U<O;U+=3)f(e.getX(U+0),e.getX(U+1),e.getX(U+2))}let S=new D,x=new D,P=new D,T=new D;function w(R){P.fromBufferAttribute(i,R),T.copy(P);let M=a[R];S.copy(M),S.sub(P.multiplyScalar(P.dot(M))).normalize(),x.crossVectors(T,M);let I=x.dot(c[R])<0?-1:1;o.setXYZW(R,S.x,S.y,S.z,I)}for(let R=0,M=v.length;R<M;++R){let y=v[R],I=y.start,F=y.count;for(let U=I,O=I+F;U<O;U+=3)w(e.getX(U+0)),w(e.getX(U+1)),w(e.getX(U+2))}}computeVertexNormals(){let e=this.index,t=this.getAttribute("position");if(t!==void 0){let n=this.getAttribute("normal");if(n===void 0)n=new xt(new Float32Array(t.count*3),3),this.setAttribute("normal",n);else for(let d=0,p=n.count;d<p;d++)n.setXYZ(d,0,0,0);let i=new D,r=new D,o=new D,a=new D,c=new D,l=new D,h=new D,u=new D;if(e)for(let d=0,p=e.count;d<p;d+=3){let g=e.getX(d+0),_=e.getX(d+1),m=e.getX(d+2);i.fromBufferAttribute(t,g),r.fromBufferAttribute(t,_),o.fromBufferAttribute(t,m),h.subVectors(o,r),u.subVectors(i,r),h.cross(u),a.fromBufferAttribute(n,g),c.fromBufferAttribute(n,_),l.fromBufferAttribute(n,m),a.add(h),c.add(h),l.add(h),n.setXYZ(g,a.x,a.y,a.z),n.setXYZ(_,c.x,c.y,c.z),n.setXYZ(m,l.x,l.y,l.z)}else for(let d=0,p=t.count;d<p;d+=3)i.fromBufferAttribute(t,d+0),r.fromBufferAttribute(t,d+1),o.fromBufferAttribute(t,d+2),h.subVectors(o,r),u.subVectors(i,r),h.cross(u),n.setXYZ(d+0,h.x,h.y,h.z),n.setXYZ(d+1,h.x,h.y,h.z),n.setXYZ(d+2,h.x,h.y,h.z);this.normalizeNormals(),n.needsUpdate=!0}}normalizeNormals(){let e=this.attributes.normal;for(let t=0,n=e.count;t<n;t++)sn.fromBufferAttribute(e,t),sn.normalize(),e.setXYZ(t,sn.x,sn.y,sn.z)}toNonIndexed(){function e(a,c){let l=a.array,h=a.itemSize,u=a.normalized,d=new l.constructor(c.length*h),p=0,g=0;for(let _=0,m=c.length;_<m;_++){a.isInterleavedBufferAttribute?p=c[_]*a.data.stride+a.offset:p=c[_]*h;for(let f=0;f<h;f++)d[g++]=l[p++]}return new xt(d,h,u)}if(this.index===null)return console.warn("THREE.BufferGeometry.toNonIndexed(): BufferGeometry is already non-indexed."),this;let t=new s,n=this.index.array,i=this.attributes;for(let a in i){let c=i[a],l=e(c,n);t.setAttribute(a,l)}let r=this.morphAttributes;for(let a in r){let c=[],l=r[a];for(let h=0,u=l.length;h<u;h++){let d=l[h],p=e(d,n);c.push(p)}t.morphAttributes[a]=c}t.morphTargetsRelative=this.morphTargetsRelative;let o=this.groups;for(let a=0,c=o.length;a<c;a++){let l=o[a];t.addGroup(l.start,l.count,l.materialIndex)}return t}toJSON(){let e={metadata:{version:4.6,type:"BufferGeometry",generator:"BufferGeometry.toJSON"}};if(e.uuid=this.uuid,e.type=this.type,this.name!==""&&(e.name=this.name),Object.keys(this.userData).length>0&&(e.userData=this.userData),this.parameters!==void 0){let c=this.parameters;for(let l in c)c[l]!==void 0&&(e[l]=c[l]);return e}e.data={attributes:{}};let t=this.index;t!==null&&(e.data.index={type:t.array.constructor.name,array:Array.prototype.slice.call(t.array)});let n=this.attributes;for(let c in n){let l=n[c];e.data.attributes[c]=l.toJSON(e.data)}let i={},r=!1;for(let c in this.morphAttributes){let l=this.morphAttributes[c],h=[];for(let u=0,d=l.length;u<d;u++){let p=l[u];h.push(p.toJSON(e.data))}h.length>0&&(i[c]=h,r=!0)}r&&(e.data.morphAttributes=i,e.data.morphTargetsRelative=this.morphTargetsRelative);let o=this.groups;o.length>0&&(e.data.groups=JSON.parse(JSON.stringify(o)));let a=this.boundingSphere;return a!==null&&(e.data.boundingSphere={center:a.center.toArray(),radius:a.radius}),e}clone(){return new this.constructor().copy(this)}copy(e){this.index=null,this.attributes={},this.morphAttributes={},this.groups=[],this.boundingBox=null,this.boundingSphere=null;let t={};this.name=e.name;let n=e.index;n!==null&&this.setIndex(n.clone(t));let i=e.attributes;for(let l in i){let h=i[l];this.setAttribute(l,h.clone(t))}let r=e.morphAttributes;for(let l in r){let h=[],u=r[l];for(let d=0,p=u.length;d<p;d++)h.push(u[d].clone(t));this.morphAttributes[l]=h}this.morphTargetsRelative=e.morphTargetsRelative;let o=e.groups;for(let l=0,h=o.length;l<h;l++){let u=o[l];this.addGroup(u.start,u.count,u.materialIndex)}let a=e.boundingBox;a!==null&&(this.boundingBox=a.clone());let c=e.boundingSphere;return c!==null&&(this.boundingSphere=c.clone()),this.drawRange.start=e.drawRange.start,this.drawRange.count=e.drawRange.count,this.userData=e.userData,this}dispose(){this.dispatchEvent({type:"dispose"})}},bu=new Ze,cs=new xs,Xo=new An,Su=new D,Yo=new D,qo=new D,Zo=new D,ol=new D,Ko=new D,Eu=new D,Jo=new D,we=class extends St{constructor(e=new Bt,t=new wt){super(),this.isMesh=!0,this.type="Mesh",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),e.morphTargetInfluences!==void 0&&(this.morphTargetInfluences=e.morphTargetInfluences.slice()),e.morphTargetDictionary!==void 0&&(this.morphTargetDictionary=Object.assign({},e.morphTargetDictionary)),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=i.length;r<o;r++){let a=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}getVertexPosition(e,t){let n=this.geometry,i=n.attributes.position,r=n.morphAttributes.position,o=n.morphTargetsRelative;t.fromBufferAttribute(i,e);let a=this.morphTargetInfluences;if(r&&a){Ko.set(0,0,0);for(let c=0,l=r.length;c<l;c++){let h=a[c],u=r[c];h!==0&&(ol.fromBufferAttribute(u,e),o?Ko.addScaledVector(ol,h):Ko.addScaledVector(ol.sub(t),h))}t.add(Ko)}return t}raycast(e,t){let n=this.geometry,i=this.material,r=this.matrixWorld;i!==void 0&&(n.boundingSphere===null&&n.computeBoundingSphere(),Xo.copy(n.boundingSphere),Xo.applyMatrix4(r),cs.copy(e.ray).recast(e.near),!(Xo.containsPoint(cs.origin)===!1&&(cs.intersectSphere(Xo,Su)===null||cs.origin.distanceToSquared(Su)>(e.far-e.near)**2))&&(bu.copy(r).invert(),cs.copy(e.ray).applyMatrix4(bu),!(n.boundingBox!==null&&cs.intersectsBox(n.boundingBox)===!1)&&this._computeIntersections(e,t,cs)))}_computeIntersections(e,t,n){let i,r=this.geometry,o=this.material,a=r.index,c=r.attributes.position,l=r.attributes.uv,h=r.attributes.uv1,u=r.attributes.normal,d=r.groups,p=r.drawRange;if(a!==null)if(Array.isArray(o))for(let g=0,_=d.length;g<_;g++){let m=d[g],f=o[m.materialIndex],v=Math.max(m.start,p.start),S=Math.min(a.count,Math.min(m.start+m.count,p.start+p.count));for(let x=v,P=S;x<P;x+=3){let T=a.getX(x),w=a.getX(x+1),R=a.getX(x+2);i=$o(this,f,e,n,l,h,u,T,w,R),i&&(i.faceIndex=Math.floor(x/3),i.face.materialIndex=m.materialIndex,t.push(i))}}else{let g=Math.max(0,p.start),_=Math.min(a.count,p.start+p.count);for(let m=g,f=_;m<f;m+=3){let v=a.getX(m),S=a.getX(m+1),x=a.getX(m+2);i=$o(this,o,e,n,l,h,u,v,S,x),i&&(i.faceIndex=Math.floor(m/3),t.push(i))}}else if(c!==void 0)if(Array.isArray(o))for(let g=0,_=d.length;g<_;g++){let m=d[g],f=o[m.materialIndex],v=Math.max(m.start,p.start),S=Math.min(c.count,Math.min(m.start+m.count,p.start+p.count));for(let x=v,P=S;x<P;x+=3){let T=x,w=x+1,R=x+2;i=$o(this,f,e,n,l,h,u,T,w,R),i&&(i.faceIndex=Math.floor(x/3),i.face.materialIndex=m.materialIndex,t.push(i))}}else{let g=Math.max(0,p.start),_=Math.min(c.count,p.start+p.count);for(let m=g,f=_;m<f;m+=3){let v=m,S=m+1,x=m+2;i=$o(this,o,e,n,l,h,u,v,S,x),i&&(i.faceIndex=Math.floor(m/3),t.push(i))}}}};function nm(s,e,t,n,i,r,o,a){let c;if(e.side===Vt?c=n.intersectTriangle(o,r,i,!0,a):c=n.intersectTriangle(i,r,o,e.side===Zn,a),c===null)return null;Jo.copy(a),Jo.applyMatrix4(s.matrixWorld);let l=t.ray.origin.distanceTo(Jo);return l<t.near||l>t.far?null:{distance:l,point:Jo.clone(),object:s}}function $o(s,e,t,n,i,r,o,a,c,l){s.getVertexPosition(a,Yo),s.getVertexPosition(c,qo),s.getVertexPosition(l,Zo);let h=nm(s,e,t,n,Yo,qo,Zo,Eu);if(h){let u=new D;Ei.getBarycoord(Eu,Yo,qo,Zo,u),i&&(h.uv=Ei.getInterpolatedAttribute(i,a,c,l,u,new ke)),r&&(h.uv1=Ei.getInterpolatedAttribute(r,a,c,l,u,new ke)),o&&(h.normal=Ei.getInterpolatedAttribute(o,a,c,l,u,new D),h.normal.dot(n.direction)>0&&h.normal.multiplyScalar(-1));let d={a,b:c,c:l,normal:new D,materialIndex:0};Ei.getNormal(Yo,qo,Zo,d.normal),h.face=d,h.barycoord=u}return h}var pn=class s extends Bt{constructor(e=1,t=1,n=1,i=1,r=1,o=1){super(),this.type="BoxGeometry",this.parameters={width:e,height:t,depth:n,widthSegments:i,heightSegments:r,depthSegments:o};let a=this;i=Math.floor(i),r=Math.floor(r),o=Math.floor(o);let c=[],l=[],h=[],u=[],d=0,p=0;g("z","y","x",-1,-1,n,t,e,o,r,0),g("z","y","x",1,-1,n,t,-e,o,r,1),g("x","z","y",1,1,e,n,t,i,o,2),g("x","z","y",1,-1,e,n,-t,i,o,3),g("x","y","z",1,-1,e,t,n,i,r,4),g("x","y","z",-1,-1,e,t,-n,i,r,5),this.setIndex(c),this.setAttribute("position",new yt(l,3)),this.setAttribute("normal",new yt(h,3)),this.setAttribute("uv",new yt(u,2));function g(_,m,f,v,S,x,P,T,w,R,M){let y=x/w,I=P/R,F=x/2,U=P/2,O=T/2,$=w+1,k=R+1,ee=0,Y=0,ce=new D;for(let pe=0;pe<k;pe++){let Ie=pe*I-U;for(let Ue=0;Ue<$;Ue++){let Ge=Ue*y-F;ce[_]=Ge*v,ce[m]=Ie*S,ce[f]=O,l.push(ce.x,ce.y,ce.z),ce[_]=0,ce[m]=0,ce[f]=T>0?1:-1,h.push(ce.x,ce.y,ce.z),u.push(Ue/w),u.push(1-pe/R),ee+=1}}for(let pe=0;pe<R;pe++)for(let Ie=0;Ie<w;Ie++){let Ue=d+Ie+$*pe,Ge=d+Ie+$*(pe+1),te=d+(Ie+1)+$*(pe+1),ue=d+(Ie+1)+$*pe;c.push(Ue,Ge,ue),c.push(Ge,te,ue),Y+=6}a.addGroup(p,Y,M),p+=Y,d+=ee}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.width,e.height,e.depth,e.widthSegments,e.heightSegments,e.depthSegments)}};function Ns(s){let e={};for(let t in s){e[t]={};for(let n in s[t]){let i=s[t][n];i&&(i.isColor||i.isMatrix3||i.isMatrix4||i.isVector2||i.isVector3||i.isVector4||i.isTexture||i.isQuaternion)?i.isRenderTargetTexture?(console.warn("UniformsUtils: Textures of render targets cannot be cloned via cloneUniforms() or mergeUniforms()."),e[t][n]=null):e[t][n]=i.clone():Array.isArray(i)?e[t][n]=i.slice():e[t][n]=i}}return e}function _n(s){let e={};for(let t=0;t<s.length;t++){let n=Ns(s[t]);for(let i in n)e[i]=n[i]}return e}function im(s){let e=[];for(let t=0;t<s.length;t++)e.push(s[t].clone());return e}function ql(s){let e=s.getRenderTarget();return e===null?s.outputColorSpace:e.isXRRenderTarget===!0?e.texture.colorSpace:ft.workingColorSpace}var Od={clone:Ns,merge:_n},sm=`void main() {
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`,rm=`void main() {
	gl_FragColor = vec4( 1.0, 0.0, 0.0, 1.0 );
}`,Jn=class extends bn{constructor(e){super(),this.isShaderMaterial=!0,this.type="ShaderMaterial",this.defines={},this.uniforms={},this.uniformsGroups=[],this.vertexShader=sm,this.fragmentShader=rm,this.linewidth=1,this.wireframe=!1,this.wireframeLinewidth=1,this.fog=!1,this.lights=!1,this.clipping=!1,this.forceSinglePass=!0,this.extensions={clipCullDistance:!1,multiDraw:!1},this.defaultAttributeValues={color:[1,1,1],uv:[0,0],uv1:[0,0]},this.index0AttributeName=void 0,this.uniformsNeedUpdate=!1,this.glslVersion=null,e!==void 0&&this.setValues(e)}copy(e){return super.copy(e),this.fragmentShader=e.fragmentShader,this.vertexShader=e.vertexShader,this.uniforms=Ns(e.uniforms),this.uniformsGroups=im(e.uniformsGroups),this.defines=Object.assign({},e.defines),this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.fog=e.fog,this.lights=e.lights,this.clipping=e.clipping,this.extensions=Object.assign({},e.extensions),this.glslVersion=e.glslVersion,this}toJSON(e){let t=super.toJSON(e);t.glslVersion=this.glslVersion,t.uniforms={};for(let i in this.uniforms){let o=this.uniforms[i].value;o&&o.isTexture?t.uniforms[i]={type:"t",value:o.toJSON(e).uuid}:o&&o.isColor?t.uniforms[i]={type:"c",value:o.getHex()}:o&&o.isVector2?t.uniforms[i]={type:"v2",value:o.toArray()}:o&&o.isVector3?t.uniforms[i]={type:"v3",value:o.toArray()}:o&&o.isVector4?t.uniforms[i]={type:"v4",value:o.toArray()}:o&&o.isMatrix3?t.uniforms[i]={type:"m3",value:o.toArray()}:o&&o.isMatrix4?t.uniforms[i]={type:"m4",value:o.toArray()}:t.uniforms[i]={value:o}}Object.keys(this.defines).length>0&&(t.defines=this.defines),t.vertexShader=this.vertexShader,t.fragmentShader=this.fragmentShader,t.lights=this.lights,t.clipping=this.clipping;let n={};for(let i in this.extensions)this.extensions[i]===!0&&(n[i]=!0);return Object.keys(n).length>0&&(t.extensions=n),t}},$r=class extends St{constructor(){super(),this.isCamera=!0,this.type="Camera",this.matrixWorldInverse=new Ze,this.projectionMatrix=new Ze,this.projectionMatrixInverse=new Ze,this.coordinateSystem=oi}copy(e,t){return super.copy(e,t),this.matrixWorldInverse.copy(e.matrixWorldInverse),this.projectionMatrix.copy(e.projectionMatrix),this.projectionMatrixInverse.copy(e.projectionMatrixInverse),this.coordinateSystem=e.coordinateSystem,this}getWorldDirection(e){return super.getWorldDirection(e).negate()}updateMatrixWorld(e){super.updateMatrixWorld(e),this.matrixWorldInverse.copy(this.matrixWorld).invert()}updateWorldMatrix(e,t){super.updateWorldMatrix(e,t),this.matrixWorldInverse.copy(this.matrixWorld).invert()}clone(){return new this.constructor().copy(this)}},Yi=new D,Tu=new ke,Au=new ke,Yt=class extends $r{constructor(e=50,t=1,n=.1,i=2e3){super(),this.isPerspectiveCamera=!0,this.type="PerspectiveCamera",this.fov=e,this.zoom=1,this.near=n,this.far=i,this.focus=10,this.aspect=t,this.view=null,this.filmGauge=35,this.filmOffset=0,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.fov=e.fov,this.zoom=e.zoom,this.near=e.near,this.far=e.far,this.focus=e.focus,this.aspect=e.aspect,this.view=e.view===null?null:Object.assign({},e.view),this.filmGauge=e.filmGauge,this.filmOffset=e.filmOffset,this}setFocalLength(e){let t=.5*this.getFilmHeight()/e;this.fov=_s*2*Math.atan(t),this.updateProjectionMatrix()}getFocalLength(){let e=Math.tan(Vr*.5*this.fov);return .5*this.getFilmHeight()/e}getEffectiveFOV(){return _s*2*Math.atan(Math.tan(Vr*.5*this.fov)/this.zoom)}getFilmWidth(){return this.filmGauge*Math.min(this.aspect,1)}getFilmHeight(){return this.filmGauge/Math.max(this.aspect,1)}getViewBounds(e,t,n){Yi.set(-1,-1,.5).applyMatrix4(this.projectionMatrixInverse),t.set(Yi.x,Yi.y).multiplyScalar(-e/Yi.z),Yi.set(1,1,.5).applyMatrix4(this.projectionMatrixInverse),n.set(Yi.x,Yi.y).multiplyScalar(-e/Yi.z)}getViewSize(e,t){return this.getViewBounds(e,Tu,Au),t.subVectors(Au,Tu)}setViewOffset(e,t,n,i,r,o){this.aspect=e/t,this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=this.near,t=e*Math.tan(Vr*.5*this.fov)/this.zoom,n=2*t,i=this.aspect*n,r=-.5*i,o=this.view;if(this.view!==null&&this.view.enabled){let c=o.fullWidth,l=o.fullHeight;r+=o.offsetX*i/c,t-=o.offsetY*n/l,i*=o.width/c,n*=o.height/l}let a=this.filmOffset;a!==0&&(r+=e*a/this.getFilmWidth()),this.projectionMatrix.makePerspective(r,r+i,t,t-n,e,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.fov=this.fov,t.object.zoom=this.zoom,t.object.near=this.near,t.object.far=this.far,t.object.focus=this.focus,t.object.aspect=this.aspect,this.view!==null&&(t.object.view=Object.assign({},this.view)),t.object.filmGauge=this.filmGauge,t.object.filmOffset=this.filmOffset,t}},er=-90,tr=1,ga=class extends St{constructor(e,t,n){super(),this.type="CubeCamera",this.renderTarget=n,this.coordinateSystem=null,this.activeMipmapLevel=0;let i=new Yt(er,tr,e,t);i.layers=this.layers,this.add(i);let r=new Yt(er,tr,e,t);r.layers=this.layers,this.add(r);let o=new Yt(er,tr,e,t);o.layers=this.layers,this.add(o);let a=new Yt(er,tr,e,t);a.layers=this.layers,this.add(a);let c=new Yt(er,tr,e,t);c.layers=this.layers,this.add(c);let l=new Yt(er,tr,e,t);l.layers=this.layers,this.add(l)}updateCoordinateSystem(){let e=this.coordinateSystem,t=this.children.concat(),[n,i,r,o,a,c]=t;for(let l of t)this.remove(l);if(e===oi)n.up.set(0,1,0),n.lookAt(1,0,0),i.up.set(0,1,0),i.lookAt(-1,0,0),r.up.set(0,0,-1),r.lookAt(0,1,0),o.up.set(0,0,1),o.lookAt(0,-1,0),a.up.set(0,1,0),a.lookAt(0,0,1),c.up.set(0,1,0),c.lookAt(0,0,-1);else if(e===Yr)n.up.set(0,-1,0),n.lookAt(-1,0,0),i.up.set(0,-1,0),i.lookAt(1,0,0),r.up.set(0,0,1),r.lookAt(0,1,0),o.up.set(0,0,-1),o.lookAt(0,-1,0),a.up.set(0,-1,0),a.lookAt(0,0,1),c.up.set(0,-1,0),c.lookAt(0,0,-1);else throw new Error("THREE.CubeCamera.updateCoordinateSystem(): Invalid coordinate system: "+e);for(let l of t)this.add(l),l.updateMatrixWorld()}update(e,t){this.parent===null&&this.updateMatrixWorld();let{renderTarget:n,activeMipmapLevel:i}=this;this.coordinateSystem!==e.coordinateSystem&&(this.coordinateSystem=e.coordinateSystem,this.updateCoordinateSystem());let[r,o,a,c,l,h]=this.children,u=e.getRenderTarget(),d=e.getActiveCubeFace(),p=e.getActiveMipmapLevel(),g=e.xr.enabled;e.xr.enabled=!1;let _=n.texture.generateMipmaps;n.texture.generateMipmaps=!1,e.setRenderTarget(n,0,i),e.render(t,r),e.setRenderTarget(n,1,i),e.render(t,o),e.setRenderTarget(n,2,i),e.render(t,a),e.setRenderTarget(n,3,i),e.render(t,c),e.setRenderTarget(n,4,i),e.render(t,l),n.texture.generateMipmaps=_,e.setRenderTarget(n,5,i),e.render(t,h),e.setRenderTarget(u,d,p),e.xr.enabled=g,n.texture.needsPMREMUpdate=!0}},jr=class extends $t{constructor(e,t,n,i,r,o,a,c,l,h){e=e!==void 0?e:[],t=t!==void 0?t:Is,super(e,t,n,i,r,o,a,c,l,h),this.isCubeTexture=!0,this.flipY=!1}get images(){return this.image}set images(e){this.image=e}},_a=class extends ai{constructor(e=1,t={}){super(e,e,t),this.isWebGLCubeRenderTarget=!0;let n={width:e,height:e,depth:1},i=[n,n,n,n,n,n];this.texture=new jr(i,t.mapping,t.wrapS,t.wrapT,t.magFilter,t.minFilter,t.format,t.type,t.anisotropy,t.colorSpace),this.texture.isRenderTargetTexture=!0,this.texture.generateMipmaps=t.generateMipmaps!==void 0?t.generateMipmaps:!1,this.texture.minFilter=t.minFilter!==void 0?t.minFilter:Nt}fromEquirectangularTexture(e,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;let n={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},i=new pn(5,5,5),r=new Jn({name:"CubemapFromEquirect",uniforms:Ns(n.uniforms),vertexShader:n.vertexShader,fragmentShader:n.fragmentShader,side:Vt,blending:Ui});r.uniforms.tEquirect.value=t;let o=new we(i,r),a=t.minFilter;return t.minFilter===Bn&&(t.minFilter=Nt),new ga(1,10,this).update(e,o),t.minFilter=a,o.geometry.dispose(),o.material.dispose(),this}clear(e,t,n,i){let r=e.getRenderTarget();for(let o=0;o<6;o++)e.setRenderTarget(this,o),e.clear(t,n,i);e.setRenderTarget(r)}},Pt=class extends St{constructor(){super(),this.isGroup=!0,this.type="Group"}},om={type:"move"},ur=class{constructor(){this._targetRay=null,this._grip=null,this._hand=null}getHandSpace(){return this._hand===null&&(this._hand=new Pt,this._hand.matrixAutoUpdate=!1,this._hand.visible=!1,this._hand.joints={},this._hand.inputState={pinching:!1}),this._hand}getTargetRaySpace(){return this._targetRay===null&&(this._targetRay=new Pt,this._targetRay.matrixAutoUpdate=!1,this._targetRay.visible=!1,this._targetRay.hasLinearVelocity=!1,this._targetRay.linearVelocity=new D,this._targetRay.hasAngularVelocity=!1,this._targetRay.angularVelocity=new D),this._targetRay}getGripSpace(){return this._grip===null&&(this._grip=new Pt,this._grip.matrixAutoUpdate=!1,this._grip.visible=!1,this._grip.hasLinearVelocity=!1,this._grip.linearVelocity=new D,this._grip.hasAngularVelocity=!1,this._grip.angularVelocity=new D),this._grip}dispatchEvent(e){return this._targetRay!==null&&this._targetRay.dispatchEvent(e),this._grip!==null&&this._grip.dispatchEvent(e),this._hand!==null&&this._hand.dispatchEvent(e),this}connect(e){if(e&&e.hand){let t=this._hand;if(t)for(let n of e.hand.values())this._getHandJoint(t,n)}return this.dispatchEvent({type:"connected",data:e}),this}disconnect(e){return this.dispatchEvent({type:"disconnected",data:e}),this._targetRay!==null&&(this._targetRay.visible=!1),this._grip!==null&&(this._grip.visible=!1),this._hand!==null&&(this._hand.visible=!1),this}update(e,t,n){let i=null,r=null,o=null,a=this._targetRay,c=this._grip,l=this._hand;if(e&&t.session.visibilityState!=="visible-blurred"){if(l&&e.hand){o=!0;for(let _ of e.hand.values()){let m=t.getJointPose(_,n),f=this._getHandJoint(l,_);m!==null&&(f.matrix.fromArray(m.transform.matrix),f.matrix.decompose(f.position,f.rotation,f.scale),f.matrixWorldNeedsUpdate=!0,f.jointRadius=m.radius),f.visible=m!==null}let h=l.joints["index-finger-tip"],u=l.joints["thumb-tip"],d=h.position.distanceTo(u.position),p=.02,g=.005;l.inputState.pinching&&d>p+g?(l.inputState.pinching=!1,this.dispatchEvent({type:"pinchend",handedness:e.handedness,target:this})):!l.inputState.pinching&&d<=p-g&&(l.inputState.pinching=!0,this.dispatchEvent({type:"pinchstart",handedness:e.handedness,target:this}))}else c!==null&&e.gripSpace&&(r=t.getPose(e.gripSpace,n),r!==null&&(c.matrix.fromArray(r.transform.matrix),c.matrix.decompose(c.position,c.rotation,c.scale),c.matrixWorldNeedsUpdate=!0,r.linearVelocity?(c.hasLinearVelocity=!0,c.linearVelocity.copy(r.linearVelocity)):c.hasLinearVelocity=!1,r.angularVelocity?(c.hasAngularVelocity=!0,c.angularVelocity.copy(r.angularVelocity)):c.hasAngularVelocity=!1));a!==null&&(i=t.getPose(e.targetRaySpace,n),i===null&&r!==null&&(i=r),i!==null&&(a.matrix.fromArray(i.transform.matrix),a.matrix.decompose(a.position,a.rotation,a.scale),a.matrixWorldNeedsUpdate=!0,i.linearVelocity?(a.hasLinearVelocity=!0,a.linearVelocity.copy(i.linearVelocity)):a.hasLinearVelocity=!1,i.angularVelocity?(a.hasAngularVelocity=!0,a.angularVelocity.copy(i.angularVelocity)):a.hasAngularVelocity=!1,this.dispatchEvent(om)))}return a!==null&&(a.visible=i!==null),c!==null&&(c.visible=r!==null),l!==null&&(l.visible=o!==null),this}_getHandJoint(e,t){if(e.joints[t.jointName]===void 0){let n=new Pt;n.matrixAutoUpdate=!1,n.visible=!1,e.joints[t.jointName]=n,e.add(n)}return e.joints[t.jointName]}},Qr=class s{constructor(e,t=25e-5){this.isFogExp2=!0,this.name="",this.color=new ge(e),this.density=t}clone(){return new s(this.color,this.density)}toJSON(){return{type:"FogExp2",name:this.name,color:this.color.getHex(),density:this.density}}};var ys=class extends St{constructor(){super(),this.isScene=!0,this.type="Scene",this.background=null,this.environment=null,this.fog=null,this.backgroundBlurriness=0,this.backgroundIntensity=1,this.backgroundRotation=new Kn,this.environmentIntensity=1,this.environmentRotation=new Kn,this.overrideMaterial=null,typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}copy(e,t){return super.copy(e,t),e.background!==null&&(this.background=e.background.clone()),e.environment!==null&&(this.environment=e.environment.clone()),e.fog!==null&&(this.fog=e.fog.clone()),this.backgroundBlurriness=e.backgroundBlurriness,this.backgroundIntensity=e.backgroundIntensity,this.backgroundRotation.copy(e.backgroundRotation),this.environmentIntensity=e.environmentIntensity,this.environmentRotation.copy(e.environmentRotation),e.overrideMaterial!==null&&(this.overrideMaterial=e.overrideMaterial.clone()),this.matrixAutoUpdate=e.matrixAutoUpdate,this}toJSON(e){let t=super.toJSON(e);return this.fog!==null&&(t.object.fog=this.fog.toJSON()),this.backgroundBlurriness>0&&(t.object.backgroundBlurriness=this.backgroundBlurriness),this.backgroundIntensity!==1&&(t.object.backgroundIntensity=this.backgroundIntensity),t.object.backgroundRotation=this.backgroundRotation.toArray(),this.environmentIntensity!==1&&(t.object.environmentIntensity=this.environmentIntensity),t.object.environmentRotation=this.environmentRotation.toArray(),t}},vs=class{constructor(e,t){this.isInterleavedBuffer=!0,this.array=e,this.stride=t,this.count=e!==void 0?e.length/t:0,this.usage=da,this.updateRanges=[],this.version=0,this.uuid=qn()}onUploadCallback(){}set needsUpdate(e){e===!0&&this.version++}setUsage(e){return this.usage=e,this}addUpdateRange(e,t){this.updateRanges.push({start:e,count:t})}clearUpdateRanges(){this.updateRanges.length=0}copy(e){return this.array=new e.array.constructor(e.array),this.count=e.count,this.stride=e.stride,this.usage=e.usage,this}copyAt(e,t,n){e*=this.stride,n*=t.stride;for(let i=0,r=this.stride;i<r;i++)this.array[e+i]=t.array[n+i];return this}set(e,t=0){return this.array.set(e,t),this}clone(e){e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=qn()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=this.array.slice(0).buffer);let t=new this.array.constructor(e.arrayBuffers[this.array.buffer._uuid]),n=new this.constructor(t,this.stride);return n.setUsage(this.usage),n}onUpload(e){return this.onUploadCallback=e,this}toJSON(e){return e.arrayBuffers===void 0&&(e.arrayBuffers={}),this.array.buffer._uuid===void 0&&(this.array.buffer._uuid=qn()),e.arrayBuffers[this.array.buffer._uuid]===void 0&&(e.arrayBuffers[this.array.buffer._uuid]=Array.from(new Uint32Array(this.array.buffer))),{uuid:this.uuid,buffer:this.array.buffer._uuid,type:this.array.constructor.name,stride:this.stride}}},vn=new D,Ki=class s{constructor(e,t,n,i=!1){this.isInterleavedBufferAttribute=!0,this.name="",this.data=e,this.itemSize=t,this.offset=n,this.normalized=i}get count(){return this.data.count}get array(){return this.data.array}set needsUpdate(e){this.data.needsUpdate=e}applyMatrix4(e){for(let t=0,n=this.data.count;t<n;t++)vn.fromBufferAttribute(this,t),vn.applyMatrix4(e),this.setXYZ(t,vn.x,vn.y,vn.z);return this}applyNormalMatrix(e){for(let t=0,n=this.count;t<n;t++)vn.fromBufferAttribute(this,t),vn.applyNormalMatrix(e),this.setXYZ(t,vn.x,vn.y,vn.z);return this}transformDirection(e){for(let t=0,n=this.count;t<n;t++)vn.fromBufferAttribute(this,t),vn.transformDirection(e),this.setXYZ(t,vn.x,vn.y,vn.z);return this}getComponent(e,t){let n=this.array[e*this.data.stride+this.offset+t];return this.normalized&&(n=Yn(n,this.array)),n}setComponent(e,t,n){return this.normalized&&(n=Tt(n,this.array)),this.data.array[e*this.data.stride+this.offset+t]=n,this}setX(e,t){return this.normalized&&(t=Tt(t,this.array)),this.data.array[e*this.data.stride+this.offset]=t,this}setY(e,t){return this.normalized&&(t=Tt(t,this.array)),this.data.array[e*this.data.stride+this.offset+1]=t,this}setZ(e,t){return this.normalized&&(t=Tt(t,this.array)),this.data.array[e*this.data.stride+this.offset+2]=t,this}setW(e,t){return this.normalized&&(t=Tt(t,this.array)),this.data.array[e*this.data.stride+this.offset+3]=t,this}getX(e){let t=this.data.array[e*this.data.stride+this.offset];return this.normalized&&(t=Yn(t,this.array)),t}getY(e){let t=this.data.array[e*this.data.stride+this.offset+1];return this.normalized&&(t=Yn(t,this.array)),t}getZ(e){let t=this.data.array[e*this.data.stride+this.offset+2];return this.normalized&&(t=Yn(t,this.array)),t}getW(e){let t=this.data.array[e*this.data.stride+this.offset+3];return this.normalized&&(t=Yn(t,this.array)),t}setXY(e,t,n){return e=e*this.data.stride+this.offset,this.normalized&&(t=Tt(t,this.array),n=Tt(n,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this}setXYZ(e,t,n,i){return e=e*this.data.stride+this.offset,this.normalized&&(t=Tt(t,this.array),n=Tt(n,this.array),i=Tt(i,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=i,this}setXYZW(e,t,n,i,r){return e=e*this.data.stride+this.offset,this.normalized&&(t=Tt(t,this.array),n=Tt(n,this.array),i=Tt(i,this.array),r=Tt(r,this.array)),this.data.array[e+0]=t,this.data.array[e+1]=n,this.data.array[e+2]=i,this.data.array[e+3]=r,this}clone(e){if(e===void 0){console.log("THREE.InterleavedBufferAttribute.clone(): Cloning an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[i+r])}return new xt(new this.array.constructor(t),this.itemSize,this.normalized)}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.clone(e)),new s(e.interleavedBuffers[this.data.uuid],this.itemSize,this.offset,this.normalized)}toJSON(e){if(e===void 0){console.log("THREE.InterleavedBufferAttribute.toJSON(): Serializing an interleaved buffer attribute will de-interleave buffer data.");let t=[];for(let n=0;n<this.count;n++){let i=n*this.data.stride+this.offset;for(let r=0;r<this.itemSize;r++)t.push(this.data.array[i+r])}return{itemSize:this.itemSize,type:this.array.constructor.name,array:t,normalized:this.normalized}}else return e.interleavedBuffers===void 0&&(e.interleavedBuffers={}),e.interleavedBuffers[this.data.uuid]===void 0&&(e.interleavedBuffers[this.data.uuid]=this.data.toJSON(e)),{isInterleavedBufferAttribute:!0,itemSize:this.itemSize,data:this.data.uuid,offset:this.offset,normalized:this.normalized}}},Ji=class extends bn{constructor(e){super(),this.isSpriteMaterial=!0,this.type="SpriteMaterial",this.color=new ge(16777215),this.map=null,this.alphaMap=null,this.rotation=0,this.sizeAttenuation=!0,this.transparent=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.rotation=e.rotation,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}},nr,Fr=new D,ir=new D,sr=new D,rr=new ke,Br=new ke,zd=new Ze,jo=new D,Or=new D,Qo=new D,wu=new ke,al=new ke,Ru=new ke,Ms=class extends St{constructor(e=new Ji){if(super(),this.isSprite=!0,this.type="Sprite",nr===void 0){nr=new Bt;let t=new Float32Array([-.5,-.5,0,0,0,.5,-.5,0,1,0,.5,.5,0,1,1,-.5,.5,0,0,1]),n=new vs(t,5);nr.setIndex([0,1,2,0,2,3]),nr.setAttribute("position",new Ki(n,3,0,!1)),nr.setAttribute("uv",new Ki(n,2,3,!1))}this.geometry=nr,this.material=e,this.center=new ke(.5,.5)}raycast(e,t){e.camera===null&&console.error('THREE.Sprite: "Raycaster.camera" needs to be set in order to raycast against sprites.'),ir.setFromMatrixScale(this.matrixWorld),zd.copy(e.camera.matrixWorld),this.modelViewMatrix.multiplyMatrices(e.camera.matrixWorldInverse,this.matrixWorld),sr.setFromMatrixPosition(this.modelViewMatrix),e.camera.isPerspectiveCamera&&this.material.sizeAttenuation===!1&&ir.multiplyScalar(-sr.z);let n=this.material.rotation,i,r;n!==0&&(r=Math.cos(n),i=Math.sin(n));let o=this.center;ea(jo.set(-.5,-.5,0),sr,o,ir,i,r),ea(Or.set(.5,-.5,0),sr,o,ir,i,r),ea(Qo.set(.5,.5,0),sr,o,ir,i,r),wu.set(0,0),al.set(1,0),Ru.set(1,1);let a=e.ray.intersectTriangle(jo,Or,Qo,!1,Fr);if(a===null&&(ea(Or.set(-.5,.5,0),sr,o,ir,i,r),al.set(0,1),a=e.ray.intersectTriangle(jo,Qo,Or,!1,Fr),a===null))return;let c=e.ray.origin.distanceTo(Fr);c<e.near||c>e.far||t.push({distance:c,point:Fr.clone(),uv:Ei.getInterpolation(Fr,jo,Or,Qo,wu,al,Ru,new ke),face:null,object:this})}copy(e,t){return super.copy(e,t),e.center!==void 0&&this.center.copy(e.center),this.material=e.material,this}};function ea(s,e,t,n,i,r){rr.subVectors(s,t).addScalar(.5).multiply(n),i!==void 0?(Br.x=r*rr.x-i*rr.y,Br.y=i*rr.x+r*rr.y):Br.copy(rr),s.copy(e),s.x+=Br.x,s.y+=Br.y,s.applyMatrix4(zd)}var Cu=new D,Iu=new _t,Pu=new _t,am=new D,Lu=new Ze,ta=new D,cl=new An,Du=new Ze,ll=new xs,eo=class extends we{constructor(e,t){super(e,t),this.isSkinnedMesh=!0,this.type="SkinnedMesh",this.bindMode=pl,this.bindMatrix=new Ze,this.bindMatrixInverse=new Ze,this.boundingBox=null,this.boundingSphere=null}computeBoundingBox(){let e=this.geometry;this.boundingBox===null&&(this.boundingBox=new rn),this.boundingBox.makeEmpty();let t=e.getAttribute("position");for(let n=0;n<t.count;n++)this.getVertexPosition(n,ta),this.boundingBox.expandByPoint(ta)}computeBoundingSphere(){let e=this.geometry;this.boundingSphere===null&&(this.boundingSphere=new An),this.boundingSphere.makeEmpty();let t=e.getAttribute("position");for(let n=0;n<t.count;n++)this.getVertexPosition(n,ta),this.boundingSphere.expandByPoint(ta)}copy(e,t){return super.copy(e,t),this.bindMode=e.bindMode,this.bindMatrix.copy(e.bindMatrix),this.bindMatrixInverse.copy(e.bindMatrixInverse),this.skeleton=e.skeleton,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}raycast(e,t){let n=this.material,i=this.matrixWorld;n!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),cl.copy(this.boundingSphere),cl.applyMatrix4(i),e.ray.intersectsSphere(cl)!==!1&&(Du.copy(i).invert(),ll.copy(e.ray).applyMatrix4(Du),!(this.boundingBox!==null&&ll.intersectsBox(this.boundingBox)===!1)&&this._computeIntersections(e,t,ll)))}getVertexPosition(e,t){return super.getVertexPosition(e,t),this.applyBoneTransform(e,t),t}bind(e,t){this.skeleton=e,t===void 0&&(this.updateMatrixWorld(!0),this.skeleton.calculateInverses(),t=this.matrixWorld),this.bindMatrix.copy(t),this.bindMatrixInverse.copy(t).invert()}pose(){this.skeleton.pose()}normalizeSkinWeights(){let e=new _t,t=this.geometry.attributes.skinWeight;for(let n=0,i=t.count;n<i;n++){e.fromBufferAttribute(t,n);let r=1/e.manhattanLength();r!==1/0?e.multiplyScalar(r):e.set(1,0,0,0),t.setXYZW(n,e.x,e.y,e.z,e.w)}}updateMatrixWorld(e){super.updateMatrixWorld(e),this.bindMode===pl?this.bindMatrixInverse.copy(this.matrixWorld).invert():this.bindMode===Md?this.bindMatrixInverse.copy(this.bindMatrix).invert():console.warn("THREE.SkinnedMesh: Unrecognized bindMode: "+this.bindMode)}applyBoneTransform(e,t){let n=this.skeleton,i=this.geometry;Iu.fromBufferAttribute(i.attributes.skinIndex,e),Pu.fromBufferAttribute(i.attributes.skinWeight,e),Cu.copy(t).applyMatrix4(this.bindMatrix),t.set(0,0,0);for(let r=0;r<4;r++){let o=Pu.getComponent(r);if(o!==0){let a=Iu.getComponent(r);Lu.multiplyMatrices(n.bones[a].matrixWorld,n.boneInverses[a]),t.addScaledVector(am.copy(Cu).applyMatrix4(Lu),o)}}return t.applyMatrix4(this.bindMatrixInverse)}},dr=class extends St{constructor(){super(),this.isBone=!0,this.type="Bone"}},$i=class extends $t{constructor(e=null,t=1,n=1,i,r,o,a,c,l=ln,h=ln,u,d){super(null,o,a,c,l,h,i,r,u,d),this.isDataTexture=!0,this.image={data:e,width:t,height:n},this.generateMipmaps=!1,this.flipY=!1,this.unpackAlignment=1}},Uu=new Ze,cm=new Ze,to=class s{constructor(e=[],t=[]){this.uuid=qn(),this.bones=e.slice(0),this.boneInverses=t,this.boneMatrices=null,this.boneTexture=null,this.init()}init(){let e=this.bones,t=this.boneInverses;if(this.boneMatrices=new Float32Array(e.length*16),t.length===0)this.calculateInverses();else if(e.length!==t.length){console.warn("THREE.Skeleton: Number of inverse bone matrices does not match amount of bones."),this.boneInverses=[];for(let n=0,i=this.bones.length;n<i;n++)this.boneInverses.push(new Ze)}}calculateInverses(){this.boneInverses.length=0;for(let e=0,t=this.bones.length;e<t;e++){let n=new Ze;this.bones[e]&&n.copy(this.bones[e].matrixWorld).invert(),this.boneInverses.push(n)}}pose(){for(let e=0,t=this.bones.length;e<t;e++){let n=this.bones[e];n&&n.matrixWorld.copy(this.boneInverses[e]).invert()}for(let e=0,t=this.bones.length;e<t;e++){let n=this.bones[e];n&&(n.parent&&n.parent.isBone?(n.matrix.copy(n.parent.matrixWorld).invert(),n.matrix.multiply(n.matrixWorld)):n.matrix.copy(n.matrixWorld),n.matrix.decompose(n.position,n.quaternion,n.scale))}}update(){let e=this.bones,t=this.boneInverses,n=this.boneMatrices,i=this.boneTexture;for(let r=0,o=e.length;r<o;r++){let a=e[r]?e[r].matrixWorld:cm;Uu.multiplyMatrices(a,t[r]),Uu.toArray(n,r*16)}i!==null&&(i.needsUpdate=!0)}clone(){return new s(this.bones,this.boneInverses)}computeBoneTexture(){let e=Math.sqrt(this.bones.length*4);e=Math.ceil(e/4)*4,e=Math.max(e,4);let t=new Float32Array(e*e*4);t.set(this.boneMatrices);let n=new $i(t,e,e,Pn,gn);return n.needsUpdate=!0,this.boneMatrices=t,this.boneTexture=n,this}getBoneByName(e){for(let t=0,n=this.bones.length;t<n;t++){let i=this.bones[t];if(i.name===e)return i}}dispose(){this.boneTexture!==null&&(this.boneTexture.dispose(),this.boneTexture=null)}fromJSON(e,t){this.uuid=e.uuid;for(let n=0,i=e.bones.length;n<i;n++){let r=e.bones[n],o=t[r];o===void 0&&(console.warn("THREE.Skeleton: No bone found with UUID:",r),o=new dr),this.bones.push(o),this.boneInverses.push(new Ze().fromArray(e.boneInverses[n]))}return this.init(),this}toJSON(){let e={metadata:{version:4.6,type:"Skeleton",generator:"Skeleton.toJSON"},bones:[],boneInverses:[]};e.uuid=this.uuid;let t=this.bones,n=this.boneInverses;for(let i=0,r=t.length;i<r;i++){let o=t[i];e.bones.push(o.uuid);let a=n[i];e.boneInverses.push(a.toArray())}return e}},ji=class extends xt{constructor(e,t,n,i=1){super(e,t,n),this.isInstancedBufferAttribute=!0,this.meshPerAttribute=i}copy(e){return super.copy(e),this.meshPerAttribute=e.meshPerAttribute,this}toJSON(){let e=super.toJSON();return e.meshPerAttribute=this.meshPerAttribute,e.isInstancedBufferAttribute=!0,e}},or=new Ze,Nu=new Ze,na=[],Fu=new rn,lm=new Ze,zr=new we,Hr=new An,Fn=class extends we{constructor(e,t,n){super(e,t),this.isInstancedMesh=!0,this.instanceMatrix=new ji(new Float32Array(n*16),16),this.instanceColor=null,this.morphTexture=null,this.count=n,this.boundingBox=null,this.boundingSphere=null;for(let i=0;i<n;i++)this.setMatrixAt(i,lm)}computeBoundingBox(){let e=this.geometry,t=this.count;this.boundingBox===null&&(this.boundingBox=new rn),e.boundingBox===null&&e.computeBoundingBox(),this.boundingBox.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,or),Fu.copy(e.boundingBox).applyMatrix4(or),this.boundingBox.union(Fu)}computeBoundingSphere(){let e=this.geometry,t=this.count;this.boundingSphere===null&&(this.boundingSphere=new An),e.boundingSphere===null&&e.computeBoundingSphere(),this.boundingSphere.makeEmpty();for(let n=0;n<t;n++)this.getMatrixAt(n,or),Hr.copy(e.boundingSphere).applyMatrix4(or),this.boundingSphere.union(Hr)}copy(e,t){return super.copy(e,t),this.instanceMatrix.copy(e.instanceMatrix),e.morphTexture!==null&&(this.morphTexture=e.morphTexture.clone()),e.instanceColor!==null&&(this.instanceColor=e.instanceColor.clone()),this.count=e.count,e.boundingBox!==null&&(this.boundingBox=e.boundingBox.clone()),e.boundingSphere!==null&&(this.boundingSphere=e.boundingSphere.clone()),this}getColorAt(e,t){t.fromArray(this.instanceColor.array,e*3)}getMatrixAt(e,t){t.fromArray(this.instanceMatrix.array,e*16)}getMorphAt(e,t){let n=t.morphTargetInfluences,i=this.morphTexture.source.data.data,r=n.length+1,o=e*r+1;for(let a=0;a<n.length;a++)n[a]=i[o+a]}raycast(e,t){let n=this.matrixWorld,i=this.count;if(zr.geometry=this.geometry,zr.material=this.material,zr.material!==void 0&&(this.boundingSphere===null&&this.computeBoundingSphere(),Hr.copy(this.boundingSphere),Hr.applyMatrix4(n),e.ray.intersectsSphere(Hr)!==!1))for(let r=0;r<i;r++){this.getMatrixAt(r,or),Nu.multiplyMatrices(n,or),zr.matrixWorld=Nu,zr.raycast(e,na);for(let o=0,a=na.length;o<a;o++){let c=na[o];c.instanceId=r,c.object=this,t.push(c)}na.length=0}}setColorAt(e,t){this.instanceColor===null&&(this.instanceColor=new ji(new Float32Array(this.instanceMatrix.count*3).fill(1),3)),t.toArray(this.instanceColor.array,e*3)}setMatrixAt(e,t){t.toArray(this.instanceMatrix.array,e*16)}setMorphAt(e,t){let n=t.morphTargetInfluences,i=n.length+1;this.morphTexture===null&&(this.morphTexture=new $i(new Float32Array(i*this.count),i,this.count,Va,gn));let r=this.morphTexture.source.data.data,o=0;for(let l=0;l<n.length;l++)o+=n[l];let a=this.geometry.morphTargetsRelative?1:1-o,c=i*e;r[c]=a,r.set(n,c+1)}updateMorphTargets(){}dispose(){this.dispatchEvent({type:"dispose"}),this.morphTexture!==null&&(this.morphTexture.dispose(),this.morphTexture=null)}},hl=new D,hm=new D,um=new Qe,ri=class{constructor(e=new D(1,0,0),t=0){this.isPlane=!0,this.normal=e,this.constant=t}set(e,t){return this.normal.copy(e),this.constant=t,this}setComponents(e,t,n,i){return this.normal.set(e,t,n),this.constant=i,this}setFromNormalAndCoplanarPoint(e,t){return this.normal.copy(e),this.constant=-t.dot(this.normal),this}setFromCoplanarPoints(e,t,n){let i=hl.subVectors(n,t).cross(hm.subVectors(e,t)).normalize();return this.setFromNormalAndCoplanarPoint(i,e),this}copy(e){return this.normal.copy(e.normal),this.constant=e.constant,this}normalize(){let e=1/this.normal.length();return this.normal.multiplyScalar(e),this.constant*=e,this}negate(){return this.constant*=-1,this.normal.negate(),this}distanceToPoint(e){return this.normal.dot(e)+this.constant}distanceToSphere(e){return this.distanceToPoint(e.center)-e.radius}projectPoint(e,t){return t.copy(e).addScaledVector(this.normal,-this.distanceToPoint(e))}intersectLine(e,t){let n=e.delta(hl),i=this.normal.dot(n);if(i===0)return this.distanceToPoint(e.start)===0?t.copy(e.start):null;let r=-(e.start.dot(this.normal)+this.constant)/i;return r<0||r>1?null:t.copy(e.start).addScaledVector(n,r)}intersectsLine(e){let t=this.distanceToPoint(e.start),n=this.distanceToPoint(e.end);return t<0&&n>0||n<0&&t>0}intersectsBox(e){return e.intersectsPlane(this)}intersectsSphere(e){return e.intersectsPlane(this)}coplanarPoint(e){return e.copy(this.normal).multiplyScalar(-this.constant)}applyMatrix4(e,t){let n=t||um.getNormalMatrix(e),i=this.coplanarPoint(hl).applyMatrix4(e),r=this.normal.applyMatrix3(n).normalize();return this.constant=-i.dot(r),this}translate(e){return this.constant-=e.dot(this.normal),this}equals(e){return e.normal.equals(this.normal)&&e.constant===this.constant}clone(){return new this.constructor().copy(this)}},ls=new An,ia=new D,fr=class{constructor(e=new ri,t=new ri,n=new ri,i=new ri,r=new ri,o=new ri){this.planes=[e,t,n,i,r,o]}set(e,t,n,i,r,o){let a=this.planes;return a[0].copy(e),a[1].copy(t),a[2].copy(n),a[3].copy(i),a[4].copy(r),a[5].copy(o),this}copy(e){let t=this.planes;for(let n=0;n<6;n++)t[n].copy(e.planes[n]);return this}setFromProjectionMatrix(e,t=oi){let n=this.planes,i=e.elements,r=i[0],o=i[1],a=i[2],c=i[3],l=i[4],h=i[5],u=i[6],d=i[7],p=i[8],g=i[9],_=i[10],m=i[11],f=i[12],v=i[13],S=i[14],x=i[15];if(n[0].setComponents(c-r,d-l,m-p,x-f).normalize(),n[1].setComponents(c+r,d+l,m+p,x+f).normalize(),n[2].setComponents(c+o,d+h,m+g,x+v).normalize(),n[3].setComponents(c-o,d-h,m-g,x-v).normalize(),n[4].setComponents(c-a,d-u,m-_,x-S).normalize(),t===oi)n[5].setComponents(c+a,d+u,m+_,x+S).normalize();else if(t===Yr)n[5].setComponents(a,u,_,S).normalize();else throw new Error("THREE.Frustum.setFromProjectionMatrix(): Invalid coordinate system: "+t);return this}intersectsObject(e){if(e.boundingSphere!==void 0)e.boundingSphere===null&&e.computeBoundingSphere(),ls.copy(e.boundingSphere).applyMatrix4(e.matrixWorld);else{let t=e.geometry;t.boundingSphere===null&&t.computeBoundingSphere(),ls.copy(t.boundingSphere).applyMatrix4(e.matrixWorld)}return this.intersectsSphere(ls)}intersectsSprite(e){return ls.center.set(0,0,0),ls.radius=.7071067811865476,ls.applyMatrix4(e.matrixWorld),this.intersectsSphere(ls)}intersectsSphere(e){let t=this.planes,n=e.center,i=-e.radius;for(let r=0;r<6;r++)if(t[r].distanceToPoint(n)<i)return!1;return!0}intersectsBox(e){let t=this.planes;for(let n=0;n<6;n++){let i=t[n];if(ia.x=i.normal.x>0?e.max.x:e.min.x,ia.y=i.normal.y>0?e.max.y:e.min.y,ia.z=i.normal.z>0?e.max.z:e.min.z,i.distanceToPoint(ia)<0)return!1}return!0}containsPoint(e){let t=this.planes;for(let n=0;n<6;n++)if(t[n].distanceToPoint(e)<0)return!1;return!0}clone(){return new this.constructor().copy(this)}};var pr=class extends bn{constructor(e){super(),this.isLineBasicMaterial=!0,this.type="LineBasicMaterial",this.color=new ge(16777215),this.map=null,this.linewidth=1,this.linecap="round",this.linejoin="round",this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.linewidth=e.linewidth,this.linecap=e.linecap,this.linejoin=e.linejoin,this.fog=e.fog,this}},xa=new D,ya=new D,Bu=new Ze,kr=new xs,sa=new An,ul=new D,Ou=new D,bs=class extends St{constructor(e=new Bt,t=new pr){super(),this.isLine=!0,this.type="Line",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[0];for(let i=1,r=t.count;i<r;i++)xa.fromBufferAttribute(t,i-1),ya.fromBufferAttribute(t,i),n[i]=n[i-1],n[i]+=xa.distanceTo(ya);e.setAttribute("lineDistance",new yt(n,1))}else console.warn("THREE.Line.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}raycast(e,t){let n=this.geometry,i=this.matrixWorld,r=e.params.Line.threshold,o=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),sa.copy(n.boundingSphere),sa.applyMatrix4(i),sa.radius+=r,e.ray.intersectsSphere(sa)===!1)return;Bu.copy(i).invert(),kr.copy(e.ray).applyMatrix4(Bu);let a=r/((this.scale.x+this.scale.y+this.scale.z)/3),c=a*a,l=this.isLineSegments?2:1,h=n.index,d=n.attributes.position;if(h!==null){let p=Math.max(0,o.start),g=Math.min(h.count,o.start+o.count);for(let _=p,m=g-1;_<m;_+=l){let f=h.getX(_),v=h.getX(_+1),S=ra(this,e,kr,c,f,v,_);S&&t.push(S)}if(this.isLineLoop){let _=h.getX(g-1),m=h.getX(p),f=ra(this,e,kr,c,_,m,g-1);f&&t.push(f)}}else{let p=Math.max(0,o.start),g=Math.min(d.count,o.start+o.count);for(let _=p,m=g-1;_<m;_+=l){let f=ra(this,e,kr,c,_,_+1,_);f&&t.push(f)}if(this.isLineLoop){let _=ra(this,e,kr,c,g-1,p,g-1);_&&t.push(_)}}}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=i.length;r<o;r++){let a=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}};function ra(s,e,t,n,i,r,o){let a=s.geometry.attributes.position;if(xa.fromBufferAttribute(a,i),ya.fromBufferAttribute(a,r),t.distanceSqToSegment(xa,ya,ul,Ou)>n)return;ul.applyMatrix4(s.matrixWorld);let l=e.ray.origin.distanceTo(ul);if(!(l<e.near||l>e.far))return{distance:l,point:Ou.clone().applyMatrix4(s.matrixWorld),index:o,face:null,faceIndex:null,barycoord:null,object:s}}var zu=new D,Hu=new D,no=class extends bs{constructor(e,t){super(e,t),this.isLineSegments=!0,this.type="LineSegments"}computeLineDistances(){let e=this.geometry;if(e.index===null){let t=e.attributes.position,n=[];for(let i=0,r=t.count;i<r;i+=2)zu.fromBufferAttribute(t,i),Hu.fromBufferAttribute(t,i+1),n[i]=i===0?0:n[i-1],n[i+1]=n[i]+zu.distanceTo(Hu);e.setAttribute("lineDistance",new yt(n,1))}else console.warn("THREE.LineSegments.computeLineDistances(): Computation only possible with non-indexed BufferGeometry.");return this}},io=class extends bs{constructor(e,t){super(e,t),this.isLineLoop=!0,this.type="LineLoop"}},Qi=class extends bn{constructor(e){super(),this.isPointsMaterial=!0,this.type="PointsMaterial",this.color=new ge(16777215),this.map=null,this.alphaMap=null,this.size=1,this.sizeAttenuation=!0,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.color.copy(e.color),this.map=e.map,this.alphaMap=e.alphaMap,this.size=e.size,this.sizeAttenuation=e.sizeAttenuation,this.fog=e.fog,this}},ku=new Ze,yl=new xs,oa=new An,aa=new D,Ss=class extends St{constructor(e=new Bt,t=new Qi){super(),this.isPoints=!0,this.type="Points",this.geometry=e,this.material=t,this.morphTargetDictionary=void 0,this.morphTargetInfluences=void 0,this.updateMorphTargets()}copy(e,t){return super.copy(e,t),this.material=Array.isArray(e.material)?e.material.slice():e.material,this.geometry=e.geometry,this}raycast(e,t){let n=this.geometry,i=this.matrixWorld,r=e.params.Points.threshold,o=n.drawRange;if(n.boundingSphere===null&&n.computeBoundingSphere(),oa.copy(n.boundingSphere),oa.applyMatrix4(i),oa.radius+=r,e.ray.intersectsSphere(oa)===!1)return;ku.copy(i).invert(),yl.copy(e.ray).applyMatrix4(ku);let a=r/((this.scale.x+this.scale.y+this.scale.z)/3),c=a*a,l=n.index,u=n.attributes.position;if(l!==null){let d=Math.max(0,o.start),p=Math.min(l.count,o.start+o.count);for(let g=d,_=p;g<_;g++){let m=l.getX(g);aa.fromBufferAttribute(u,m),Gu(aa,m,c,i,e,t,this)}}else{let d=Math.max(0,o.start),p=Math.min(u.count,o.start+o.count);for(let g=d,_=p;g<_;g++)aa.fromBufferAttribute(u,g),Gu(aa,g,c,i,e,t,this)}}updateMorphTargets(){let t=this.geometry.morphAttributes,n=Object.keys(t);if(n.length>0){let i=t[n[0]];if(i!==void 0){this.morphTargetInfluences=[],this.morphTargetDictionary={};for(let r=0,o=i.length;r<o;r++){let a=i[r].name||String(r);this.morphTargetInfluences.push(0),this.morphTargetDictionary[a]=r}}}}};function Gu(s,e,t,n,i,r,o){let a=yl.distanceSqToPoint(s);if(a<t){let c=new D;yl.closestPointToPoint(s,c),c.applyMatrix4(n);let l=i.ray.origin.distanceTo(c);if(l<i.near||l>i.far)return;r.push({distance:l,distanceToRay:Math.sqrt(a),point:c,index:e,face:null,faceIndex:null,barycoord:null,object:o})}}var Lt=class extends $t{constructor(e,t,n,i,r,o,a,c,l){super(e,t,n,i,r,o,a,c,l),this.isCanvasTexture=!0,this.needsUpdate=!0}},so=class extends $t{constructor(e,t,n,i,r,o,a,c,l,h=us){if(h!==us&&h!==ps)throw new Error("DepthTexture format must be either THREE.DepthFormat or THREE.DepthStencilFormat");n===void 0&&h===us&&(n=es),n===void 0&&h===ps&&(n=Us),super(null,i,r,o,a,c,h,n,l),this.isDepthTexture=!0,this.image={width:e,height:t},this.magFilter=a!==void 0?a:ln,this.minFilter=c!==void 0?c:ln,this.flipY=!1,this.generateMipmaps=!1,this.compareFunction=null}copy(e){return super.copy(e),this.source=new hr(Object.assign({},e.image)),this.compareFunction=e.compareFunction,this}toJSON(e){let t=super.toJSON(e);return this.compareFunction!==null&&(t.compareFunction=this.compareFunction),t}};var ro=class s extends Bt{constructor(e=1,t=32,n=0,i=Math.PI*2){super(),this.type="CircleGeometry",this.parameters={radius:e,segments:t,thetaStart:n,thetaLength:i},t=Math.max(3,t);let r=[],o=[],a=[],c=[],l=new D,h=new ke;o.push(0,0,0),a.push(0,0,1),c.push(.5,.5);for(let u=0,d=3;u<=t;u++,d+=3){let p=n+u/t*i;l.x=e*Math.cos(p),l.y=e*Math.sin(p),o.push(l.x,l.y,l.z),a.push(0,0,1),h.x=(o[d]/e+1)/2,h.y=(o[d+1]/e+1)/2,c.push(h.x,h.y)}for(let u=1;u<=t;u++)r.push(u,u+1,0);this.setIndex(r),this.setAttribute("position",new yt(o,3)),this.setAttribute("normal",new yt(a,3)),this.setAttribute("uv",new yt(c,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.radius,e.segments,e.thetaStart,e.thetaLength)}},mn=class s extends Bt{constructor(e=1,t=1,n=1,i=32,r=1,o=!1,a=0,c=Math.PI*2){super(),this.type="CylinderGeometry",this.parameters={radiusTop:e,radiusBottom:t,height:n,radialSegments:i,heightSegments:r,openEnded:o,thetaStart:a,thetaLength:c};let l=this;i=Math.floor(i),r=Math.floor(r);let h=[],u=[],d=[],p=[],g=0,_=[],m=n/2,f=0;v(),o===!1&&(e>0&&S(!0),t>0&&S(!1)),this.setIndex(h),this.setAttribute("position",new yt(u,3)),this.setAttribute("normal",new yt(d,3)),this.setAttribute("uv",new yt(p,2));function v(){let x=new D,P=new D,T=0,w=(t-e)/n;for(let R=0;R<=r;R++){let M=[],y=R/r,I=y*(t-e)+e;for(let F=0;F<=i;F++){let U=F/i,O=U*c+a,$=Math.sin(O),k=Math.cos(O);P.x=I*$,P.y=-y*n+m,P.z=I*k,u.push(P.x,P.y,P.z),x.set($,w,k).normalize(),d.push(x.x,x.y,x.z),p.push(U,1-y),M.push(g++)}_.push(M)}for(let R=0;R<i;R++)for(let M=0;M<r;M++){let y=_[M][R],I=_[M+1][R],F=_[M+1][R+1],U=_[M][R+1];(e>0||M!==0)&&(h.push(y,I,U),T+=3),(t>0||M!==r-1)&&(h.push(I,F,U),T+=3)}l.addGroup(f,T,0),f+=T}function S(x){let P=g,T=new ke,w=new D,R=0,M=x===!0?e:t,y=x===!0?1:-1;for(let F=1;F<=i;F++)u.push(0,m*y,0),d.push(0,y,0),p.push(.5,.5),g++;let I=g;for(let F=0;F<=i;F++){let O=F/i*c+a,$=Math.cos(O),k=Math.sin(O);w.x=M*k,w.y=m*y,w.z=M*$,u.push(w.x,w.y,w.z),d.push(0,y,0),T.x=$*.5+.5,T.y=k*.5*y+.5,p.push(T.x,T.y),g++}for(let F=0;F<i;F++){let U=P+F,O=I+F;x===!0?h.push(O,O+1,U):h.push(O+1,O,U),R+=3}l.addGroup(f,R,x===!0?1:2),f+=R}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.radiusTop,e.radiusBottom,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}},oo=class s extends mn{constructor(e=1,t=1,n=32,i=1,r=!1,o=0,a=Math.PI*2){super(0,e,t,n,i,r,o,a),this.type="ConeGeometry",this.parameters={radius:e,height:t,radialSegments:n,heightSegments:i,openEnded:r,thetaStart:o,thetaLength:a}}static fromJSON(e){return new s(e.radius,e.height,e.radialSegments,e.heightSegments,e.openEnded,e.thetaStart,e.thetaLength)}},ao=class s extends Bt{constructor(e=[],t=[],n=1,i=0){super(),this.type="PolyhedronGeometry",this.parameters={vertices:e,indices:t,radius:n,detail:i};let r=[],o=[];a(i),l(n),h(),this.setAttribute("position",new yt(r,3)),this.setAttribute("normal",new yt(r.slice(),3)),this.setAttribute("uv",new yt(o,2)),i===0?this.computeVertexNormals():this.normalizeNormals();function a(v){let S=new D,x=new D,P=new D;for(let T=0;T<t.length;T+=3)p(t[T+0],S),p(t[T+1],x),p(t[T+2],P),c(S,x,P,v)}function c(v,S,x,P){let T=P+1,w=[];for(let R=0;R<=T;R++){w[R]=[];let M=v.clone().lerp(x,R/T),y=S.clone().lerp(x,R/T),I=T-R;for(let F=0;F<=I;F++)F===0&&R===T?w[R][F]=M:w[R][F]=M.clone().lerp(y,F/I)}for(let R=0;R<T;R++)for(let M=0;M<2*(T-R)-1;M++){let y=Math.floor(M/2);M%2===0?(d(w[R][y+1]),d(w[R+1][y]),d(w[R][y])):(d(w[R][y+1]),d(w[R+1][y+1]),d(w[R+1][y]))}}function l(v){let S=new D;for(let x=0;x<r.length;x+=3)S.x=r[x+0],S.y=r[x+1],S.z=r[x+2],S.normalize().multiplyScalar(v),r[x+0]=S.x,r[x+1]=S.y,r[x+2]=S.z}function h(){let v=new D;for(let S=0;S<r.length;S+=3){v.x=r[S+0],v.y=r[S+1],v.z=r[S+2];let x=m(v)/2/Math.PI+.5,P=f(v)/Math.PI+.5;o.push(x,1-P)}g(),u()}function u(){for(let v=0;v<o.length;v+=6){let S=o[v+0],x=o[v+2],P=o[v+4],T=Math.max(S,x,P),w=Math.min(S,x,P);T>.9&&w<.1&&(S<.2&&(o[v+0]+=1),x<.2&&(o[v+2]+=1),P<.2&&(o[v+4]+=1))}}function d(v){r.push(v.x,v.y,v.z)}function p(v,S){let x=v*3;S.x=e[x+0],S.y=e[x+1],S.z=e[x+2]}function g(){let v=new D,S=new D,x=new D,P=new D,T=new ke,w=new ke,R=new ke;for(let M=0,y=0;M<r.length;M+=9,y+=6){v.set(r[M+0],r[M+1],r[M+2]),S.set(r[M+3],r[M+4],r[M+5]),x.set(r[M+6],r[M+7],r[M+8]),T.set(o[y+0],o[y+1]),w.set(o[y+2],o[y+3]),R.set(o[y+4],o[y+5]),P.copy(v).add(S).add(x).divideScalar(3);let I=m(P);_(T,y+0,v,I),_(w,y+2,S,I),_(R,y+4,x,I)}}function _(v,S,x,P){P<0&&v.x===1&&(o[S]=v.x-1),x.x===0&&x.z===0&&(o[S]=P/2/Math.PI+.5)}function m(v){return Math.atan2(v.z,-v.x)}function f(v){return Math.atan2(-v.y,Math.sqrt(v.x*v.x+v.z*v.z))}}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.vertices,e.indices,e.radius,e.details)}};var co=class s extends ao{constructor(e=1,t=0){let n=(1+Math.sqrt(5))/2,i=[-1,n,0,1,n,0,-1,-n,0,1,-n,0,0,-1,n,0,1,n,0,-1,-n,0,1,-n,n,0,-1,n,0,1,-n,0,-1,-n,0,1],r=[0,11,5,0,5,1,0,1,7,0,7,10,0,10,11,1,5,9,5,11,4,11,10,2,10,7,6,7,1,8,3,9,4,3,4,2,3,2,6,3,6,8,3,8,9,4,9,5,2,4,11,6,2,10,8,6,7,9,8,1];super(i,r,e,t),this.type="IcosahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new s(e.radius,e.detail)}},lo=class s extends ao{constructor(e=1,t=0){let n=[1,0,0,-1,0,0,0,1,0,0,-1,0,0,0,1,0,0,-1],i=[0,2,4,0,4,3,0,3,5,0,5,2,1,2,5,1,5,3,1,3,4,1,4,2];super(n,i,e,t),this.type="OctahedronGeometry",this.parameters={radius:e,detail:t}}static fromJSON(e){return new s(e.radius,e.detail)}},jt=class s extends Bt{constructor(e=1,t=1,n=1,i=1){super(),this.type="PlaneGeometry",this.parameters={width:e,height:t,widthSegments:n,heightSegments:i};let r=e/2,o=t/2,a=Math.floor(n),c=Math.floor(i),l=a+1,h=c+1,u=e/a,d=t/c,p=[],g=[],_=[],m=[];for(let f=0;f<h;f++){let v=f*d-o;for(let S=0;S<l;S++){let x=S*u-r;g.push(x,-v,0),_.push(0,0,1),m.push(S/a),m.push(1-f/c)}}for(let f=0;f<c;f++)for(let v=0;v<a;v++){let S=v+l*f,x=v+l*(f+1),P=v+1+l*(f+1),T=v+1+l*f;p.push(S,x,T),p.push(x,P,T)}this.setIndex(p),this.setAttribute("position",new yt(g,3)),this.setAttribute("normal",new yt(_,3)),this.setAttribute("uv",new yt(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.width,e.height,e.widthSegments,e.heightSegments)}},Ci=class s extends Bt{constructor(e=.5,t=1,n=32,i=1,r=0,o=Math.PI*2){super(),this.type="RingGeometry",this.parameters={innerRadius:e,outerRadius:t,thetaSegments:n,phiSegments:i,thetaStart:r,thetaLength:o},n=Math.max(3,n),i=Math.max(1,i);let a=[],c=[],l=[],h=[],u=e,d=(t-e)/i,p=new D,g=new ke;for(let _=0;_<=i;_++){for(let m=0;m<=n;m++){let f=r+m/n*o;p.x=u*Math.cos(f),p.y=u*Math.sin(f),c.push(p.x,p.y,p.z),l.push(0,0,1),g.x=(p.x/t+1)/2,g.y=(p.y/t+1)/2,h.push(g.x,g.y)}u+=d}for(let _=0;_<i;_++){let m=_*(n+1);for(let f=0;f<n;f++){let v=f+m,S=v,x=v+n+1,P=v+n+2,T=v+1;a.push(S,x,T),a.push(x,P,T)}}this.setIndex(a),this.setAttribute("position",new yt(c,3)),this.setAttribute("normal",new yt(l,3)),this.setAttribute("uv",new yt(h,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.innerRadius,e.outerRadius,e.thetaSegments,e.phiSegments,e.thetaStart,e.thetaLength)}};var ho=class s extends Bt{constructor(e=1,t=32,n=16,i=0,r=Math.PI*2,o=0,a=Math.PI){super(),this.type="SphereGeometry",this.parameters={radius:e,widthSegments:t,heightSegments:n,phiStart:i,phiLength:r,thetaStart:o,thetaLength:a},t=Math.max(3,Math.floor(t)),n=Math.max(2,Math.floor(n));let c=Math.min(o+a,Math.PI),l=0,h=[],u=new D,d=new D,p=[],g=[],_=[],m=[];for(let f=0;f<=n;f++){let v=[],S=f/n,x=0;f===0&&o===0?x=.5/t:f===n&&c===Math.PI&&(x=-.5/t);for(let P=0;P<=t;P++){let T=P/t;u.x=-e*Math.cos(i+T*r)*Math.sin(o+S*a),u.y=e*Math.cos(o+S*a),u.z=e*Math.sin(i+T*r)*Math.sin(o+S*a),g.push(u.x,u.y,u.z),d.copy(u).normalize(),_.push(d.x,d.y,d.z),m.push(T+x,1-S),v.push(l++)}h.push(v)}for(let f=0;f<n;f++)for(let v=0;v<t;v++){let S=h[f][v+1],x=h[f][v],P=h[f+1][v],T=h[f+1][v+1];(f!==0||o>0)&&p.push(S,x,T),(f!==n-1||c<Math.PI)&&p.push(x,P,T)}this.setIndex(p),this.setAttribute("position",new yt(g,3)),this.setAttribute("normal",new yt(_,3)),this.setAttribute("uv",new yt(m,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.radius,e.widthSegments,e.heightSegments,e.phiStart,e.phiLength,e.thetaStart,e.thetaLength)}};var uo=class s extends Bt{constructor(e=1,t=.4,n=12,i=48,r=Math.PI*2){super(),this.type="TorusGeometry",this.parameters={radius:e,tube:t,radialSegments:n,tubularSegments:i,arc:r},n=Math.floor(n),i=Math.floor(i);let o=[],a=[],c=[],l=[],h=new D,u=new D,d=new D;for(let p=0;p<=n;p++)for(let g=0;g<=i;g++){let _=g/i*r,m=p/n*Math.PI*2;u.x=(e+t*Math.cos(m))*Math.cos(_),u.y=(e+t*Math.cos(m))*Math.sin(_),u.z=t*Math.sin(m),a.push(u.x,u.y,u.z),h.x=e*Math.cos(_),h.y=e*Math.sin(_),d.subVectors(u,h).normalize(),c.push(d.x,d.y,d.z),l.push(g/i),l.push(p/n)}for(let p=1;p<=n;p++)for(let g=1;g<=i;g++){let _=(i+1)*p+g-1,m=(i+1)*(p-1)+g-1,f=(i+1)*(p-1)+g,v=(i+1)*p+g;o.push(_,m,v),o.push(m,f,v)}this.setIndex(o),this.setAttribute("position",new yt(a,3)),this.setAttribute("normal",new yt(c,3)),this.setAttribute("uv",new yt(l,2))}copy(e){return super.copy(e),this.parameters=Object.assign({},e.parameters),this}static fromJSON(e){return new s(e.radius,e.tube,e.radialSegments,e.tubularSegments,e.arc)}};var Rt=class extends bn{constructor(e){super(),this.isMeshStandardMaterial=!0,this.type="MeshStandardMaterial",this.defines={STANDARD:""},this.color=new ge(16777215),this.roughness=1,this.metalness=0,this.map=null,this.lightMap=null,this.lightMapIntensity=1,this.aoMap=null,this.aoMapIntensity=1,this.emissive=new ge(0),this.emissiveIntensity=1,this.emissiveMap=null,this.bumpMap=null,this.bumpScale=1,this.normalMap=null,this.normalMapType=kl,this.normalScale=new ke(1,1),this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.roughnessMap=null,this.metalnessMap=null,this.alphaMap=null,this.envMap=null,this.envMapRotation=new Kn,this.envMapIntensity=1,this.wireframe=!1,this.wireframeLinewidth=1,this.wireframeLinecap="round",this.wireframeLinejoin="round",this.flatShading=!1,this.fog=!0,this.setValues(e)}copy(e){return super.copy(e),this.defines={STANDARD:""},this.color.copy(e.color),this.roughness=e.roughness,this.metalness=e.metalness,this.map=e.map,this.lightMap=e.lightMap,this.lightMapIntensity=e.lightMapIntensity,this.aoMap=e.aoMap,this.aoMapIntensity=e.aoMapIntensity,this.emissive.copy(e.emissive),this.emissiveMap=e.emissiveMap,this.emissiveIntensity=e.emissiveIntensity,this.bumpMap=e.bumpMap,this.bumpScale=e.bumpScale,this.normalMap=e.normalMap,this.normalMapType=e.normalMapType,this.normalScale.copy(e.normalScale),this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.roughnessMap=e.roughnessMap,this.metalnessMap=e.metalnessMap,this.alphaMap=e.alphaMap,this.envMap=e.envMap,this.envMapRotation.copy(e.envMapRotation),this.envMapIntensity=e.envMapIntensity,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this.wireframeLinecap=e.wireframeLinecap,this.wireframeLinejoin=e.wireframeLinejoin,this.flatShading=e.flatShading,this.fog=e.fog,this}},wn=class extends Rt{constructor(e){super(),this.isMeshPhysicalMaterial=!0,this.defines={STANDARD:"",PHYSICAL:""},this.type="MeshPhysicalMaterial",this.anisotropyRotation=0,this.anisotropyMap=null,this.clearcoatMap=null,this.clearcoatRoughness=0,this.clearcoatRoughnessMap=null,this.clearcoatNormalScale=new ke(1,1),this.clearcoatNormalMap=null,this.ior=1.5,Object.defineProperty(this,"reflectivity",{get:function(){return ht(2.5*(this.ior-1)/(this.ior+1),0,1)},set:function(t){this.ior=(1+.4*t)/(1-.4*t)}}),this.iridescenceMap=null,this.iridescenceIOR=1.3,this.iridescenceThicknessRange=[100,400],this.iridescenceThicknessMap=null,this.sheenColor=new ge(0),this.sheenColorMap=null,this.sheenRoughness=1,this.sheenRoughnessMap=null,this.transmissionMap=null,this.thickness=0,this.thicknessMap=null,this.attenuationDistance=1/0,this.attenuationColor=new ge(1,1,1),this.specularIntensity=1,this.specularIntensityMap=null,this.specularColor=new ge(1,1,1),this.specularColorMap=null,this._anisotropy=0,this._clearcoat=0,this._dispersion=0,this._iridescence=0,this._sheen=0,this._transmission=0,this.setValues(e)}get anisotropy(){return this._anisotropy}set anisotropy(e){this._anisotropy>0!=e>0&&this.version++,this._anisotropy=e}get clearcoat(){return this._clearcoat}set clearcoat(e){this._clearcoat>0!=e>0&&this.version++,this._clearcoat=e}get iridescence(){return this._iridescence}set iridescence(e){this._iridescence>0!=e>0&&this.version++,this._iridescence=e}get dispersion(){return this._dispersion}set dispersion(e){this._dispersion>0!=e>0&&this.version++,this._dispersion=e}get sheen(){return this._sheen}set sheen(e){this._sheen>0!=e>0&&this.version++,this._sheen=e}get transmission(){return this._transmission}set transmission(e){this._transmission>0!=e>0&&this.version++,this._transmission=e}copy(e){return super.copy(e),this.defines={STANDARD:"",PHYSICAL:""},this.anisotropy=e.anisotropy,this.anisotropyRotation=e.anisotropyRotation,this.anisotropyMap=e.anisotropyMap,this.clearcoat=e.clearcoat,this.clearcoatMap=e.clearcoatMap,this.clearcoatRoughness=e.clearcoatRoughness,this.clearcoatRoughnessMap=e.clearcoatRoughnessMap,this.clearcoatNormalMap=e.clearcoatNormalMap,this.clearcoatNormalScale.copy(e.clearcoatNormalScale),this.dispersion=e.dispersion,this.ior=e.ior,this.iridescence=e.iridescence,this.iridescenceMap=e.iridescenceMap,this.iridescenceIOR=e.iridescenceIOR,this.iridescenceThicknessRange=[...e.iridescenceThicknessRange],this.iridescenceThicknessMap=e.iridescenceThicknessMap,this.sheen=e.sheen,this.sheenColor.copy(e.sheenColor),this.sheenColorMap=e.sheenColorMap,this.sheenRoughness=e.sheenRoughness,this.sheenRoughnessMap=e.sheenRoughnessMap,this.transmission=e.transmission,this.transmissionMap=e.transmissionMap,this.thickness=e.thickness,this.thicknessMap=e.thicknessMap,this.attenuationDistance=e.attenuationDistance,this.attenuationColor.copy(e.attenuationColor),this.specularIntensity=e.specularIntensity,this.specularIntensityMap=e.specularIntensityMap,this.specularColor.copy(e.specularColor),this.specularColorMap=e.specularColorMap,this}};var va=class extends bn{constructor(e){super(),this.isMeshDepthMaterial=!0,this.type="MeshDepthMaterial",this.depthPacking=Sd,this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.wireframe=!1,this.wireframeLinewidth=1,this.setValues(e)}copy(e){return super.copy(e),this.depthPacking=e.depthPacking,this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this.wireframe=e.wireframe,this.wireframeLinewidth=e.wireframeLinewidth,this}},Ma=class extends bn{constructor(e){super(),this.isMeshDistanceMaterial=!0,this.type="MeshDistanceMaterial",this.map=null,this.alphaMap=null,this.displacementMap=null,this.displacementScale=1,this.displacementBias=0,this.setValues(e)}copy(e){return super.copy(e),this.map=e.map,this.alphaMap=e.alphaMap,this.displacementMap=e.displacementMap,this.displacementScale=e.displacementScale,this.displacementBias=e.displacementBias,this}};function ca(s,e,t){return!s||!t&&s.constructor===e?s:typeof e.BYTES_PER_ELEMENT=="number"?new e(s):Array.prototype.slice.call(s)}function dm(s){return ArrayBuffer.isView(s)&&!(s instanceof DataView)}function fm(s){function e(i,r){return s[i]-s[r]}let t=s.length,n=new Array(t);for(let i=0;i!==t;++i)n[i]=i;return n.sort(e),n}function Vu(s,e,t){let n=s.length,i=new s.constructor(n);for(let r=0,o=0;o!==n;++r){let a=t[r]*e;for(let c=0;c!==e;++c)i[o++]=s[a+c]}return i}function Hd(s,e,t,n){let i=1,r=s[0];for(;r!==void 0&&r[n]===void 0;)r=s[i++];if(r===void 0)return;let o=r[n];if(o!==void 0)if(Array.isArray(o))do o=r[n],o!==void 0&&(e.push(r.time),t.push(...o)),r=s[i++];while(r!==void 0);else if(o.toArray!==void 0)do o=r[n],o!==void 0&&(e.push(r.time),o.toArray(t,t.length)),r=s[i++];while(r!==void 0);else do o=r[n],o!==void 0&&(e.push(r.time),t.push(o)),r=s[i++];while(r!==void 0)}var Ii=class{constructor(e,t,n,i){this.parameterPositions=e,this._cachedIndex=0,this.resultBuffer=i!==void 0?i:new t.constructor(n),this.sampleValues=t,this.valueSize=n,this.settings=null,this.DefaultSettings_={}}evaluate(e){let t=this.parameterPositions,n=this._cachedIndex,i=t[n],r=t[n-1];n:{e:{let o;t:{i:if(!(e<i)){for(let a=n+2;;){if(i===void 0){if(e<r)break i;return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}if(n===a)break;if(r=i,i=t[++n],e<i)break e}o=t.length;break t}if(!(e>=r)){let a=t[1];e<a&&(n=2,r=a);for(let c=n-2;;){if(r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(n===c)break;if(i=r,r=t[--n-1],e>=r)break e}o=n,n=0;break t}break n}for(;n<o;){let a=n+o>>>1;e<t[a]?o=a:n=a+1}if(i=t[n],r=t[n-1],r===void 0)return this._cachedIndex=0,this.copySampleValue_(0);if(i===void 0)return n=t.length,this._cachedIndex=n,this.copySampleValue_(n-1)}this._cachedIndex=n,this.intervalChanged_(n,r,i)}return this.interpolate_(n,r,e,i)}getSettings_(){return this.settings||this.DefaultSettings_}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=e*i;for(let o=0;o!==i;++o)t[o]=n[r+o];return t}interpolate_(){throw new Error("call to abstract method")}intervalChanged_(){}},ba=class extends Ii{constructor(e,t,n,i){super(e,t,n,i),this._weightPrev=-0,this._offsetPrev=-0,this._weightNext=-0,this._offsetNext=-0,this.DefaultSettings_={endingStart:ml,endingEnd:ml}}intervalChanged_(e,t,n){let i=this.parameterPositions,r=e-2,o=e+1,a=i[r],c=i[o];if(a===void 0)switch(this.getSettings_().endingStart){case gl:r=e,a=2*t-n;break;case _l:r=i.length-2,a=t+i[r]-i[r+1];break;default:r=e,a=n}if(c===void 0)switch(this.getSettings_().endingEnd){case gl:o=e,c=2*n-t;break;case _l:o=1,c=n+i[1]-i[0];break;default:o=e-1,c=t}let l=(n-t)*.5,h=this.valueSize;this._weightPrev=l/(t-a),this._weightNext=l/(c-n),this._offsetPrev=r*h,this._offsetNext=o*h}interpolate_(e,t,n,i){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,c=e*a,l=c-a,h=this._offsetPrev,u=this._offsetNext,d=this._weightPrev,p=this._weightNext,g=(n-t)/(i-t),_=g*g,m=_*g,f=-d*m+2*d*_-d*g,v=(1+d)*m+(-1.5-2*d)*_+(-.5+d)*g+1,S=(-1-p)*m+(1.5+p)*_+.5*g,x=p*m-p*_;for(let P=0;P!==a;++P)r[P]=f*o[h+P]+v*o[l+P]+S*o[c+P]+x*o[u+P];return r}},Sa=class extends Ii{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,c=e*a,l=c-a,h=(n-t)/(i-t),u=1-h;for(let d=0;d!==a;++d)r[d]=o[l+d]*u+o[c+d]*h;return r}},Ea=class extends Ii{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e){return this.copySampleValue_(e-1)}},In=class{constructor(e,t,n,i){if(e===void 0)throw new Error("THREE.KeyframeTrack: track name is undefined");if(t===void 0||t.length===0)throw new Error("THREE.KeyframeTrack: no keyframes in track named "+e);this.name=e,this.times=ca(t,this.TimeBufferType),this.values=ca(n,this.ValueBufferType),this.setInterpolation(i||this.DefaultInterpolation)}static toJSON(e){let t=e.constructor,n;if(t.toJSON!==this.toJSON)n=t.toJSON(e);else{n={name:e.name,times:ca(e.times,Array),values:ca(e.values,Array)};let i=e.getInterpolation();i!==e.DefaultInterpolation&&(n.interpolation=i)}return n.type=e.ValueTypeName,n}InterpolantFactoryMethodDiscrete(e){return new Ea(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodLinear(e){return new Sa(this.times,this.values,this.getValueSize(),e)}InterpolantFactoryMethodSmooth(e){return new ba(this.times,this.values,this.getValueSize(),e)}setInterpolation(e){let t;switch(e){case ms:t=this.InterpolantFactoryMethodDiscrete;break;case gs:t=this.InterpolantFactoryMethodLinear;break;case la:t=this.InterpolantFactoryMethodSmooth;break}if(t===void 0){let n="unsupported interpolation for "+this.ValueTypeName+" keyframe track named "+this.name;if(this.createInterpolant===void 0)if(e!==this.DefaultInterpolation)this.setInterpolation(this.DefaultInterpolation);else throw new Error(n);return console.warn("THREE.KeyframeTrack:",n),this}return this.createInterpolant=t,this}getInterpolation(){switch(this.createInterpolant){case this.InterpolantFactoryMethodDiscrete:return ms;case this.InterpolantFactoryMethodLinear:return gs;case this.InterpolantFactoryMethodSmooth:return la}}getValueSize(){return this.values.length/this.times.length}shift(e){if(e!==0){let t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]+=e}return this}scale(e){if(e!==1){let t=this.times;for(let n=0,i=t.length;n!==i;++n)t[n]*=e}return this}trim(e,t){let n=this.times,i=n.length,r=0,o=i-1;for(;r!==i&&n[r]<e;)++r;for(;o!==-1&&n[o]>t;)--o;if(++o,r!==0||o!==i){r>=o&&(o=Math.max(o,1),r=o-1);let a=this.getValueSize();this.times=n.slice(r,o),this.values=this.values.slice(r*a,o*a)}return this}validate(){let e=!0,t=this.getValueSize();t-Math.floor(t)!==0&&(console.error("THREE.KeyframeTrack: Invalid value size in track.",this),e=!1);let n=this.times,i=this.values,r=n.length;r===0&&(console.error("THREE.KeyframeTrack: Track is empty.",this),e=!1);let o=null;for(let a=0;a!==r;a++){let c=n[a];if(typeof c=="number"&&isNaN(c)){console.error("THREE.KeyframeTrack: Time is not a valid number.",this,a,c),e=!1;break}if(o!==null&&o>c){console.error("THREE.KeyframeTrack: Out of order keys.",this,a,c,o),e=!1;break}o=c}if(i!==void 0&&dm(i))for(let a=0,c=i.length;a!==c;++a){let l=i[a];if(isNaN(l)){console.error("THREE.KeyframeTrack: Value is not a valid number.",this,a,l),e=!1;break}}return e}optimize(){let e=this.times.slice(),t=this.values.slice(),n=this.getValueSize(),i=this.getInterpolation()===la,r=e.length-1,o=1;for(let a=1;a<r;++a){let c=!1,l=e[a],h=e[a+1];if(l!==h&&(a!==1||l!==e[0]))if(i)c=!0;else{let u=a*n,d=u-n,p=u+n;for(let g=0;g!==n;++g){let _=t[u+g];if(_!==t[d+g]||_!==t[p+g]){c=!0;break}}}if(c){if(a!==o){e[o]=e[a];let u=a*n,d=o*n;for(let p=0;p!==n;++p)t[d+p]=t[u+p]}++o}}if(r>0){e[o]=e[r];for(let a=r*n,c=o*n,l=0;l!==n;++l)t[c+l]=t[a+l];++o}return o!==e.length?(this.times=e.slice(0,o),this.values=t.slice(0,o*n)):(this.times=e,this.values=t),this}clone(){let e=this.times.slice(),t=this.values.slice(),n=this.constructor,i=new n(this.name,e,t);return i.createInterpolant=this.createInterpolant,i}};In.prototype.TimeBufferType=Float32Array;In.prototype.ValueBufferType=Float32Array;In.prototype.DefaultInterpolation=gs;var Pi=class extends In{constructor(e,t,n){super(e,t,n)}};Pi.prototype.ValueTypeName="bool";Pi.prototype.ValueBufferType=Array;Pi.prototype.DefaultInterpolation=ms;Pi.prototype.InterpolantFactoryMethodLinear=void 0;Pi.prototype.InterpolantFactoryMethodSmooth=void 0;var fo=class extends In{};fo.prototype.ValueTypeName="color";var ci=class extends In{};ci.prototype.ValueTypeName="number";var Ta=class extends Ii{constructor(e,t,n,i){super(e,t,n,i)}interpolate_(e,t,n,i){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,c=(n-t)/(i-t),l=e*a;for(let h=l+a;l!==h;l+=4)Tn.slerpFlat(r,0,o,l-a,o,l,c);return r}},li=class extends In{InterpolantFactoryMethodLinear(e){return new Ta(this.times,this.values,this.getValueSize(),e)}};li.prototype.ValueTypeName="quaternion";li.prototype.InterpolantFactoryMethodSmooth=void 0;var Li=class extends In{constructor(e,t,n){super(e,t,n)}};Li.prototype.ValueTypeName="string";Li.prototype.ValueBufferType=Array;Li.prototype.DefaultInterpolation=ms;Li.prototype.InterpolantFactoryMethodLinear=void 0;Li.prototype.InterpolantFactoryMethodSmooth=void 0;var hi=class extends In{};hi.prototype.ValueTypeName="vector";var po=class{constructor(e="",t=-1,n=[],i=bd){this.name=e,this.tracks=n,this.duration=t,this.blendMode=i,this.uuid=qn(),this.duration<0&&this.resetDuration()}static parse(e){let t=[],n=e.tracks,i=1/(e.fps||1);for(let o=0,a=n.length;o!==a;++o)t.push(mm(n[o]).scale(i));let r=new this(e.name,e.duration,t,e.blendMode);return r.uuid=e.uuid,r}static toJSON(e){let t=[],n=e.tracks,i={name:e.name,duration:e.duration,tracks:t,uuid:e.uuid,blendMode:e.blendMode};for(let r=0,o=n.length;r!==o;++r)t.push(In.toJSON(n[r]));return i}static CreateFromMorphTargetSequence(e,t,n,i){let r=t.length,o=[];for(let a=0;a<r;a++){let c=[],l=[];c.push((a+r-1)%r,a,(a+1)%r),l.push(0,1,0);let h=fm(c);c=Vu(c,1,h),l=Vu(l,1,h),!i&&c[0]===0&&(c.push(r),l.push(l[0])),o.push(new ci(".morphTargetInfluences["+t[a].name+"]",c,l).scale(1/n))}return new this(e,-1,o)}static findByName(e,t){let n=e;if(!Array.isArray(e)){let i=e;n=i.geometry&&i.geometry.animations||i.animations}for(let i=0;i<n.length;i++)if(n[i].name===t)return n[i];return null}static CreateClipsFromMorphTargetSequences(e,t,n){let i={},r=/^([\w-]*?)([\d]+)$/;for(let a=0,c=e.length;a<c;a++){let l=e[a],h=l.name.match(r);if(h&&h.length>1){let u=h[1],d=i[u];d||(i[u]=d=[]),d.push(l)}}let o=[];for(let a in i)o.push(this.CreateFromMorphTargetSequence(a,i[a],t,n));return o}static parseAnimation(e,t){if(!e)return console.error("THREE.AnimationClip: No animation in JSONLoader data."),null;let n=function(u,d,p,g,_){if(p.length!==0){let m=[],f=[];Hd(p,m,f,g),m.length!==0&&_.push(new u(d,m,f))}},i=[],r=e.name||"default",o=e.fps||30,a=e.blendMode,c=e.length||-1,l=e.hierarchy||[];for(let u=0;u<l.length;u++){let d=l[u].keys;if(!(!d||d.length===0))if(d[0].morphTargets){let p={},g;for(g=0;g<d.length;g++)if(d[g].morphTargets)for(let _=0;_<d[g].morphTargets.length;_++)p[d[g].morphTargets[_]]=-1;for(let _ in p){let m=[],f=[];for(let v=0;v!==d[g].morphTargets.length;++v){let S=d[g];m.push(S.time),f.push(S.morphTarget===_?1:0)}i.push(new ci(".morphTargetInfluence["+_+"]",m,f))}c=p.length*o}else{let p=".bones["+t[u].name+"]";n(hi,p+".position",d,"pos",i),n(li,p+".quaternion",d,"rot",i),n(hi,p+".scale",d,"scl",i)}}return i.length===0?null:new this(r,c,i,a)}resetDuration(){let e=this.tracks,t=0;for(let n=0,i=e.length;n!==i;++n){let r=this.tracks[n];t=Math.max(t,r.times[r.times.length-1])}return this.duration=t,this}trim(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].trim(0,this.duration);return this}validate(){let e=!0;for(let t=0;t<this.tracks.length;t++)e=e&&this.tracks[t].validate();return e}optimize(){for(let e=0;e<this.tracks.length;e++)this.tracks[e].optimize();return this}clone(){let e=[];for(let t=0;t<this.tracks.length;t++)e.push(this.tracks[t].clone());return new this.constructor(this.name,this.duration,e,this.blendMode)}toJSON(){return this.constructor.toJSON(this)}};function pm(s){switch(s.toLowerCase()){case"scalar":case"double":case"float":case"number":case"integer":return ci;case"vector":case"vector2":case"vector3":case"vector4":return hi;case"color":return fo;case"quaternion":return li;case"bool":case"boolean":return Pi;case"string":return Li}throw new Error("THREE.KeyframeTrack: Unsupported typeName: "+s)}function mm(s){if(s.type===void 0)throw new Error("THREE.KeyframeTrack: track type undefined, can not parse");let e=pm(s.type);if(s.times===void 0){let t=[],n=[];Hd(s.keys,t,n,"value"),s.times=t,s.values=n}return e.parse!==void 0?e.parse(s):new e(s.name,s.times,s.values,s.interpolation)}var Ai={enabled:!1,files:{},add:function(s,e){this.enabled!==!1&&(this.files[s]=e)},get:function(s){if(this.enabled!==!1)return this.files[s]},remove:function(s){delete this.files[s]},clear:function(){this.files={}}},Aa=class{constructor(e,t,n){let i=this,r=!1,o=0,a=0,c,l=[];this.onStart=void 0,this.onLoad=e,this.onProgress=t,this.onError=n,this.itemStart=function(h){a++,r===!1&&i.onStart!==void 0&&i.onStart(h,o,a),r=!0},this.itemEnd=function(h){o++,i.onProgress!==void 0&&i.onProgress(h,o,a),o===a&&(r=!1,i.onLoad!==void 0&&i.onLoad())},this.itemError=function(h){i.onError!==void 0&&i.onError(h)},this.resolveURL=function(h){return c?c(h):h},this.setURLModifier=function(h){return c=h,this},this.addHandler=function(h,u){return l.push(h,u),this},this.removeHandler=function(h){let u=l.indexOf(h);return u!==-1&&l.splice(u,2),this},this.getHandler=function(h){for(let u=0,d=l.length;u<d;u+=2){let p=l[u],g=l[u+1];if(p.global&&(p.lastIndex=0),p.test(h))return g}return null}}},kd=new Aa,$n=class{constructor(e){this.manager=e!==void 0?e:kd,this.crossOrigin="anonymous",this.withCredentials=!1,this.path="",this.resourcePath="",this.requestHeader={}}load(){}loadAsync(e,t){let n=this;return new Promise(function(i,r){n.load(e,i,t,r)})}parse(){}setCrossOrigin(e){return this.crossOrigin=e,this}setWithCredentials(e){return this.withCredentials=e,this}setPath(e){return this.path=e,this}setResourcePath(e){return this.resourcePath=e,this}setRequestHeader(e){return this.requestHeader=e,this}};$n.DEFAULT_MATERIAL_NAME="__DEFAULT";var Si={},vl=class extends Error{constructor(e,t){super(e),this.response=t}},Es=class extends $n{constructor(e){super(e)}load(e,t,n,i){e===void 0&&(e=""),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let r=Ai.get(e);if(r!==void 0)return this.manager.itemStart(e),setTimeout(()=>{t&&t(r),this.manager.itemEnd(e)},0),r;if(Si[e]!==void 0){Si[e].push({onLoad:t,onProgress:n,onError:i});return}Si[e]=[],Si[e].push({onLoad:t,onProgress:n,onError:i});let o=new Request(e,{headers:new Headers(this.requestHeader),credentials:this.withCredentials?"include":"same-origin"}),a=this.mimeType,c=this.responseType;fetch(o).then(l=>{if(l.status===200||l.status===0){if(l.status===0&&console.warn("THREE.FileLoader: HTTP Status 0 received."),typeof ReadableStream>"u"||l.body===void 0||l.body.getReader===void 0)return l;let h=Si[e],u=l.body.getReader(),d=l.headers.get("X-File-Size")||l.headers.get("Content-Length"),p=d?parseInt(d):0,g=p!==0,_=0,m=new ReadableStream({start(f){v();function v(){u.read().then(({done:S,value:x})=>{if(S)f.close();else{_+=x.byteLength;let P=new ProgressEvent("progress",{lengthComputable:g,loaded:_,total:p});for(let T=0,w=h.length;T<w;T++){let R=h[T];R.onProgress&&R.onProgress(P)}f.enqueue(x),v()}},S=>{f.error(S)})}}});return new Response(m)}else throw new vl(`fetch for "${l.url}" responded with ${l.status}: ${l.statusText}`,l)}).then(l=>{switch(c){case"arraybuffer":return l.arrayBuffer();case"blob":return l.blob();case"document":return l.text().then(h=>new DOMParser().parseFromString(h,a));case"json":return l.json();default:if(a===void 0)return l.text();{let u=/charset="?([^;"\s]*)"?/i.exec(a),d=u&&u[1]?u[1].toLowerCase():void 0,p=new TextDecoder(d);return l.arrayBuffer().then(g=>p.decode(g))}}}).then(l=>{Ai.add(e,l);let h=Si[e];delete Si[e];for(let u=0,d=h.length;u<d;u++){let p=h[u];p.onLoad&&p.onLoad(l)}}).catch(l=>{let h=Si[e];if(h===void 0)throw this.manager.itemError(e),l;delete Si[e];for(let u=0,d=h.length;u<d;u++){let p=h[u];p.onError&&p.onError(l)}this.manager.itemError(e)}).finally(()=>{this.manager.itemEnd(e)}),this.manager.itemStart(e)}setResponseType(e){return this.responseType=e,this}setMimeType(e){return this.mimeType=e,this}};var wa=class extends $n{constructor(e){super(e)}load(e,t,n,i){this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let r=this,o=Ai.get(e);if(o!==void 0)return r.manager.itemStart(e),setTimeout(function(){t&&t(o),r.manager.itemEnd(e)},0),o;let a=lr("img");function c(){h(),Ai.add(e,this),t&&t(this),r.manager.itemEnd(e)}function l(u){h(),i&&i(u),r.manager.itemError(e),r.manager.itemEnd(e)}function h(){a.removeEventListener("load",c,!1),a.removeEventListener("error",l,!1)}return a.addEventListener("load",c,!1),a.addEventListener("error",l,!1),e.slice(0,5)!=="data:"&&this.crossOrigin!==void 0&&(a.crossOrigin=this.crossOrigin),r.manager.itemStart(e),a.src=e,a}};var mo=class extends $n{constructor(e){super(e)}load(e,t,n,i){let r=this,o=new $i,a=new Es(this.manager);return a.setResponseType("arraybuffer"),a.setRequestHeader(this.requestHeader),a.setPath(this.path),a.setWithCredentials(r.withCredentials),a.load(e,function(c){let l;try{l=r.parse(c)}catch(h){if(i!==void 0)i(h);else{console.error(h);return}}l.image!==void 0?o.image=l.image:l.data!==void 0&&(o.image.width=l.width,o.image.height=l.height,o.image.data=l.data),o.wrapS=l.wrapS!==void 0?l.wrapS:Mn,o.wrapT=l.wrapT!==void 0?l.wrapT:Mn,o.magFilter=l.magFilter!==void 0?l.magFilter:Nt,o.minFilter=l.minFilter!==void 0?l.minFilter:Nt,o.anisotropy=l.anisotropy!==void 0?l.anisotropy:1,l.colorSpace!==void 0&&(o.colorSpace=l.colorSpace),l.flipY!==void 0&&(o.flipY=l.flipY),l.format!==void 0&&(o.format=l.format),l.type!==void 0&&(o.type=l.type),l.mipmaps!==void 0&&(o.mipmaps=l.mipmaps,o.minFilter=Bn),l.mipmapCount===1&&(o.minFilter=Nt),l.generateMipmaps!==void 0&&(o.generateMipmaps=l.generateMipmaps),o.needsUpdate=!0,t&&t(o,l)},n,i),o}},Ts=class extends $n{constructor(e){super(e)}load(e,t,n,i){let r=new $t,o=new wa(this.manager);return o.setCrossOrigin(this.crossOrigin),o.setPath(this.path),o.load(e,function(a){r.image=a,r.needsUpdate=!0,t!==void 0&&t(r)},n,i),r}},As=class extends St{constructor(e,t=1){super(),this.isLight=!0,this.type="Light",this.color=new ge(e),this.intensity=t}dispose(){}copy(e,t){return super.copy(e,t),this.color.copy(e.color),this.intensity=e.intensity,this}toJSON(e){let t=super.toJSON(e);return t.object.color=this.color.getHex(),t.object.intensity=this.intensity,this.groundColor!==void 0&&(t.object.groundColor=this.groundColor.getHex()),this.distance!==void 0&&(t.object.distance=this.distance),this.angle!==void 0&&(t.object.angle=this.angle),this.decay!==void 0&&(t.object.decay=this.decay),this.penumbra!==void 0&&(t.object.penumbra=this.penumbra),this.shadow!==void 0&&(t.object.shadow=this.shadow.toJSON()),this.target!==void 0&&(t.object.target=this.target.uuid),t}},go=class extends As{constructor(e,t,n){super(e,n),this.isHemisphereLight=!0,this.type="HemisphereLight",this.position.copy(St.DEFAULT_UP),this.updateMatrix(),this.groundColor=new ge(t)}copy(e,t){return super.copy(e,t),this.groundColor.copy(e.groundColor),this}},dl=new Ze,Wu=new D,Xu=new D,_o=class{constructor(e){this.camera=e,this.intensity=1,this.bias=0,this.normalBias=0,this.radius=1,this.blurSamples=8,this.mapSize=new ke(512,512),this.map=null,this.mapPass=null,this.matrix=new Ze,this.autoUpdate=!0,this.needsUpdate=!1,this._frustum=new fr,this._frameExtents=new ke(1,1),this._viewportCount=1,this._viewports=[new _t(0,0,1,1)]}getViewportCount(){return this._viewportCount}getFrustum(){return this._frustum}updateMatrices(e){let t=this.camera,n=this.matrix;Wu.setFromMatrixPosition(e.matrixWorld),t.position.copy(Wu),Xu.setFromMatrixPosition(e.target.matrixWorld),t.lookAt(Xu),t.updateMatrixWorld(),dl.multiplyMatrices(t.projectionMatrix,t.matrixWorldInverse),this._frustum.setFromProjectionMatrix(dl),n.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1),n.multiply(dl)}getViewport(e){return this._viewports[e]}getFrameExtents(){return this._frameExtents}dispose(){this.map&&this.map.dispose(),this.mapPass&&this.mapPass.dispose()}copy(e){return this.camera=e.camera.clone(),this.intensity=e.intensity,this.bias=e.bias,this.radius=e.radius,this.mapSize.copy(e.mapSize),this}clone(){return new this.constructor().copy(this)}toJSON(){let e={};return this.intensity!==1&&(e.intensity=this.intensity),this.bias!==0&&(e.bias=this.bias),this.normalBias!==0&&(e.normalBias=this.normalBias),this.radius!==1&&(e.radius=this.radius),(this.mapSize.x!==512||this.mapSize.y!==512)&&(e.mapSize=this.mapSize.toArray()),e.camera=this.camera.toJSON(!1).object,delete e.camera.matrix,e}},Ml=class extends _o{constructor(){super(new Yt(50,1,.5,500)),this.isSpotLightShadow=!0,this.focus=1}updateMatrices(e){let t=this.camera,n=_s*2*e.angle*this.focus,i=this.mapSize.width/this.mapSize.height,r=e.distance||t.far;(n!==t.fov||i!==t.aspect||r!==t.far)&&(t.fov=n,t.aspect=i,t.far=r,t.updateProjectionMatrix()),super.updateMatrices(e)}copy(e){return super.copy(e),this.focus=e.focus,this}},ws=class extends As{constructor(e,t,n=0,i=Math.PI/3,r=0,o=2){super(e,t),this.isSpotLight=!0,this.type="SpotLight",this.position.copy(St.DEFAULT_UP),this.updateMatrix(),this.target=new St,this.distance=n,this.angle=i,this.penumbra=r,this.decay=o,this.map=null,this.shadow=new Ml}get power(){return this.intensity*Math.PI}set power(e){this.intensity=e/Math.PI}dispose(){this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.angle=e.angle,this.penumbra=e.penumbra,this.decay=e.decay,this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}},Yu=new Ze,Gr=new D,fl=new D,bl=class extends _o{constructor(){super(new Yt(90,1,.5,500)),this.isPointLightShadow=!0,this._frameExtents=new ke(4,2),this._viewportCount=6,this._viewports=[new _t(2,1,1,1),new _t(0,1,1,1),new _t(3,1,1,1),new _t(1,1,1,1),new _t(3,0,1,1),new _t(1,0,1,1)],this._cubeDirections=[new D(1,0,0),new D(-1,0,0),new D(0,0,1),new D(0,0,-1),new D(0,1,0),new D(0,-1,0)],this._cubeUps=[new D(0,1,0),new D(0,1,0),new D(0,1,0),new D(0,1,0),new D(0,0,1),new D(0,0,-1)]}updateMatrices(e,t=0){let n=this.camera,i=this.matrix,r=e.distance||n.far;r!==n.far&&(n.far=r,n.updateProjectionMatrix()),Gr.setFromMatrixPosition(e.matrixWorld),n.position.copy(Gr),fl.copy(n.position),fl.add(this._cubeDirections[t]),n.up.copy(this._cubeUps[t]),n.lookAt(fl),n.updateMatrixWorld(),i.makeTranslation(-Gr.x,-Gr.y,-Gr.z),Yu.multiplyMatrices(n.projectionMatrix,n.matrixWorldInverse),this._frustum.setFromProjectionMatrix(Yu)}},Rs=class extends As{constructor(e,t,n=0,i=2){super(e,t),this.isPointLight=!0,this.type="PointLight",this.distance=n,this.decay=i,this.shadow=new bl}get power(){return this.intensity*4*Math.PI}set power(e){this.intensity=e/(4*Math.PI)}dispose(){this.shadow.dispose()}copy(e,t){return super.copy(e,t),this.distance=e.distance,this.decay=e.decay,this.shadow=e.shadow.clone(),this}},Cs=class extends $r{constructor(e=-1,t=1,n=1,i=-1,r=.1,o=2e3){super(),this.isOrthographicCamera=!0,this.type="OrthographicCamera",this.zoom=1,this.view=null,this.left=e,this.right=t,this.top=n,this.bottom=i,this.near=r,this.far=o,this.updateProjectionMatrix()}copy(e,t){return super.copy(e,t),this.left=e.left,this.right=e.right,this.top=e.top,this.bottom=e.bottom,this.near=e.near,this.far=e.far,this.zoom=e.zoom,this.view=e.view===null?null:Object.assign({},e.view),this}setViewOffset(e,t,n,i,r,o){this.view===null&&(this.view={enabled:!0,fullWidth:1,fullHeight:1,offsetX:0,offsetY:0,width:1,height:1}),this.view.enabled=!0,this.view.fullWidth=e,this.view.fullHeight=t,this.view.offsetX=n,this.view.offsetY=i,this.view.width=r,this.view.height=o,this.updateProjectionMatrix()}clearViewOffset(){this.view!==null&&(this.view.enabled=!1),this.updateProjectionMatrix()}updateProjectionMatrix(){let e=(this.right-this.left)/(2*this.zoom),t=(this.top-this.bottom)/(2*this.zoom),n=(this.right+this.left)/2,i=(this.top+this.bottom)/2,r=n-e,o=n+e,a=i+t,c=i-t;if(this.view!==null&&this.view.enabled){let l=(this.right-this.left)/this.view.fullWidth/this.zoom,h=(this.top-this.bottom)/this.view.fullHeight/this.zoom;r+=l*this.view.offsetX,o=r+l*this.view.width,a-=h*this.view.offsetY,c=a-h*this.view.height}this.projectionMatrix.makeOrthographic(r,o,a,c,this.near,this.far,this.coordinateSystem),this.projectionMatrixInverse.copy(this.projectionMatrix).invert()}toJSON(e){let t=super.toJSON(e);return t.object.zoom=this.zoom,t.object.left=this.left,t.object.right=this.right,t.object.top=this.top,t.object.bottom=this.bottom,t.object.near=this.near,t.object.far=this.far,this.view!==null&&(t.object.view=Object.assign({},this.view)),t}},Sl=class extends _o{constructor(){super(new Cs(-5,5,5,-5,.5,500)),this.isDirectionalLightShadow=!0}},ui=class extends As{constructor(e,t){super(e,t),this.isDirectionalLight=!0,this.type="DirectionalLight",this.position.copy(St.DEFAULT_UP),this.updateMatrix(),this.target=new St,this.shadow=new Sl}dispose(){this.shadow.dispose()}copy(e){return super.copy(e),this.target=e.target.clone(),this.shadow=e.shadow.clone(),this}};var Di=class{static decodeText(e){if(console.warn("THREE.LoaderUtils: decodeText() has been deprecated with r165 and will be removed with r175. Use TextDecoder instead."),typeof TextDecoder<"u")return new TextDecoder().decode(e);let t="";for(let n=0,i=e.length;n<i;n++)t+=String.fromCharCode(e[n]);try{return decodeURIComponent(escape(t))}catch{return t}}static extractUrlBase(e){let t=e.lastIndexOf("/");return t===-1?"./":e.slice(0,t+1)}static resolveURL(e,t){return typeof e!="string"||e===""?"":(/^https?:\/\//i.test(t)&&/^\//.test(e)&&(t=t.replace(/(^https?:\/\/[^\/]+).*/i,"$1")),/^(https?:)?\/\//i.test(e)||/^data:.*,.*$/i.test(e)||/^blob:.*$/i.test(e)?e:t+e)}};var xo=class extends $n{constructor(e){super(e),this.isImageBitmapLoader=!0,typeof createImageBitmap>"u"&&console.warn("THREE.ImageBitmapLoader: createImageBitmap() not supported."),typeof fetch>"u"&&console.warn("THREE.ImageBitmapLoader: fetch() not supported."),this.options={premultiplyAlpha:"none"}}setOptions(e){return this.options=e,this}load(e,t,n,i){e===void 0&&(e=""),this.path!==void 0&&(e=this.path+e),e=this.manager.resolveURL(e);let r=this,o=Ai.get(e);if(o!==void 0){if(r.manager.itemStart(e),o.then){o.then(l=>{t&&t(l),r.manager.itemEnd(e)}).catch(l=>{i&&i(l)});return}return setTimeout(function(){t&&t(o),r.manager.itemEnd(e)},0),o}let a={};a.credentials=this.crossOrigin==="anonymous"?"same-origin":"include",a.headers=this.requestHeader;let c=fetch(e,a).then(function(l){return l.blob()}).then(function(l){return createImageBitmap(l,Object.assign(r.options,{colorSpaceConversion:"none"}))}).then(function(l){return Ai.add(e,l),t&&t(l),r.manager.itemEnd(e),l}).catch(function(l){i&&i(l),Ai.remove(e),r.manager.itemError(e),r.manager.itemEnd(e)});Ai.add(e,c),r.manager.itemStart(e)}};var Ra=class extends Yt{constructor(e=[]){super(),this.isArrayCamera=!0,this.cameras=e,this.index=0}};var Zl="\\[\\]\\.:\\/",gm=new RegExp("["+Zl+"]","g"),Kl="[^"+Zl+"]",_m="[^"+Zl.replace("\\.","")+"]",xm=/((?:WC+[\/:])*)/.source.replace("WC",Kl),ym=/(WCOD+)?/.source.replace("WCOD",_m),vm=/(?:\.(WC+)(?:\[(.+)\])?)?/.source.replace("WC",Kl),Mm=/\.(WC+)(?:\[(.+)\])?/.source.replace("WC",Kl),bm=new RegExp("^"+xm+ym+vm+Mm+"$"),Sm=["material","materials","bones","map"],El=class{constructor(e,t,n){let i=n||It.parseTrackName(t);this._targetGroup=e,this._bindings=e.subscribe_(t,i)}getValue(e,t){this.bind();let n=this._targetGroup.nCachedObjects_,i=this._bindings[n];i!==void 0&&i.getValue(e,t)}setValue(e,t){let n=this._bindings;for(let i=this._targetGroup.nCachedObjects_,r=n.length;i!==r;++i)n[i].setValue(e,t)}bind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].bind()}unbind(){let e=this._bindings;for(let t=this._targetGroup.nCachedObjects_,n=e.length;t!==n;++t)e[t].unbind()}},It=class s{constructor(e,t,n){this.path=t,this.parsedPath=n||s.parseTrackName(t),this.node=s.findNode(e,this.parsedPath.nodeName),this.rootNode=e,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}static create(e,t,n){return e&&e.isAnimationObjectGroup?new s.Composite(e,t,n):new s(e,t,n)}static sanitizeNodeName(e){return e.replace(/\s/g,"_").replace(gm,"")}static parseTrackName(e){let t=bm.exec(e);if(t===null)throw new Error("PropertyBinding: Cannot parse trackName: "+e);let n={nodeName:t[2],objectName:t[3],objectIndex:t[4],propertyName:t[5],propertyIndex:t[6]},i=n.nodeName&&n.nodeName.lastIndexOf(".");if(i!==void 0&&i!==-1){let r=n.nodeName.substring(i+1);Sm.indexOf(r)!==-1&&(n.nodeName=n.nodeName.substring(0,i),n.objectName=r)}if(n.propertyName===null||n.propertyName.length===0)throw new Error("PropertyBinding: can not parse propertyName from trackName: "+e);return n}static findNode(e,t){if(t===void 0||t===""||t==="."||t===-1||t===e.name||t===e.uuid)return e;if(e.skeleton){let n=e.skeleton.getBoneByName(t);if(n!==void 0)return n}if(e.children){let n=function(r){for(let o=0;o<r.length;o++){let a=r[o];if(a.name===t||a.uuid===t)return a;let c=n(a.children);if(c)return c}return null},i=n(e.children);if(i)return i}return null}_getValue_unavailable(){}_setValue_unavailable(){}_getValue_direct(e,t){e[t]=this.targetObject[this.propertyName]}_getValue_array(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)e[t++]=n[i]}_getValue_arrayElement(e,t){e[t]=this.resolvedProperty[this.propertyIndex]}_getValue_toArray(e,t){this.resolvedProperty.toArray(e,t)}_setValue_direct(e,t){this.targetObject[this.propertyName]=e[t]}_setValue_direct_setNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.needsUpdate=!0}_setValue_direct_setMatrixWorldNeedsUpdate(e,t){this.targetObject[this.propertyName]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_array(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++]}_setValue_array_setNeedsUpdate(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++];this.targetObject.needsUpdate=!0}_setValue_array_setMatrixWorldNeedsUpdate(e,t){let n=this.resolvedProperty;for(let i=0,r=n.length;i!==r;++i)n[i]=e[t++];this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_arrayElement(e,t){this.resolvedProperty[this.propertyIndex]=e[t]}_setValue_arrayElement_setNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.needsUpdate=!0}_setValue_arrayElement_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty[this.propertyIndex]=e[t],this.targetObject.matrixWorldNeedsUpdate=!0}_setValue_fromArray(e,t){this.resolvedProperty.fromArray(e,t)}_setValue_fromArray_setNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.needsUpdate=!0}_setValue_fromArray_setMatrixWorldNeedsUpdate(e,t){this.resolvedProperty.fromArray(e,t),this.targetObject.matrixWorldNeedsUpdate=!0}_getValue_unbound(e,t){this.bind(),this.getValue(e,t)}_setValue_unbound(e,t){this.bind(),this.setValue(e,t)}bind(){let e=this.node,t=this.parsedPath,n=t.objectName,i=t.propertyName,r=t.propertyIndex;if(e||(e=s.findNode(this.rootNode,t.nodeName),this.node=e),this.getValue=this._getValue_unavailable,this.setValue=this._setValue_unavailable,!e){console.warn("THREE.PropertyBinding: No target node found for track: "+this.path+".");return}if(n){let l=t.objectIndex;switch(n){case"materials":if(!e.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.materials){console.error("THREE.PropertyBinding: Can not bind to material.materials as node.material does not have a materials array.",this);return}e=e.material.materials;break;case"bones":if(!e.skeleton){console.error("THREE.PropertyBinding: Can not bind to bones as node does not have a skeleton.",this);return}e=e.skeleton.bones;for(let h=0;h<e.length;h++)if(e[h].name===l){l=h;break}break;case"map":if("map"in e){e=e.map;break}if(!e.material){console.error("THREE.PropertyBinding: Can not bind to material as node does not have a material.",this);return}if(!e.material.map){console.error("THREE.PropertyBinding: Can not bind to material.map as node.material does not have a map.",this);return}e=e.material.map;break;default:if(e[n]===void 0){console.error("THREE.PropertyBinding: Can not bind to objectName of node undefined.",this);return}e=e[n]}if(l!==void 0){if(e[l]===void 0){console.error("THREE.PropertyBinding: Trying to bind to objectIndex of objectName, but is undefined.",this,e);return}e=e[l]}}let o=e[i];if(o===void 0){let l=t.nodeName;console.error("THREE.PropertyBinding: Trying to update property for track: "+l+"."+i+" but it wasn't found.",e);return}let a=this.Versioning.None;this.targetObject=e,e.isMaterial===!0?a=this.Versioning.NeedsUpdate:e.isObject3D===!0&&(a=this.Versioning.MatrixWorldNeedsUpdate);let c=this.BindingType.Direct;if(r!==void 0){if(i==="morphTargetInfluences"){if(!e.geometry){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.",this);return}if(!e.geometry.morphAttributes){console.error("THREE.PropertyBinding: Can not bind to morphTargetInfluences because node does not have a geometry.morphAttributes.",this);return}e.morphTargetDictionary[r]!==void 0&&(r=e.morphTargetDictionary[r])}c=this.BindingType.ArrayElement,this.resolvedProperty=o,this.propertyIndex=r}else o.fromArray!==void 0&&o.toArray!==void 0?(c=this.BindingType.HasFromToArray,this.resolvedProperty=o):Array.isArray(o)?(c=this.BindingType.EntireArray,this.resolvedProperty=o):this.propertyName=i;this.getValue=this.GetterByBindingType[c],this.setValue=this.SetterByBindingTypeAndVersioning[c][a]}unbind(){this.node=null,this.getValue=this._getValue_unbound,this.setValue=this._setValue_unbound}};It.Composite=El;It.prototype.BindingType={Direct:0,EntireArray:1,ArrayElement:2,HasFromToArray:3};It.prototype.Versioning={None:0,NeedsUpdate:1,MatrixWorldNeedsUpdate:2};It.prototype.GetterByBindingType=[It.prototype._getValue_direct,It.prototype._getValue_array,It.prototype._getValue_arrayElement,It.prototype._getValue_toArray];It.prototype.SetterByBindingTypeAndVersioning=[[It.prototype._setValue_direct,It.prototype._setValue_direct_setNeedsUpdate,It.prototype._setValue_direct_setMatrixWorldNeedsUpdate],[It.prototype._setValue_array,It.prototype._setValue_array_setNeedsUpdate,It.prototype._setValue_array_setMatrixWorldNeedsUpdate],[It.prototype._setValue_arrayElement,It.prototype._setValue_arrayElement_setNeedsUpdate,It.prototype._setValue_arrayElement_setMatrixWorldNeedsUpdate],[It.prototype._setValue_fromArray,It.prototype._setValue_fromArray_setNeedsUpdate,It.prototype._setValue_fromArray_setMatrixWorldNeedsUpdate]];var Wy=new Float32Array(1);function Jl(s,e,t,n){let i=Em(n);switch(t){case Ul:return s*e;case Fl:return s*e;case Bl:return s*e*2;case Va:return s*e/i.components*i.byteLength;case Wa:return s*e/i.components*i.byteLength;case Ol:return s*e*2/i.components*i.byteLength;case Xa:return s*e*2/i.components*i.byteLength;case Nl:return s*e*3/i.components*i.byteLength;case Pn:return s*e*4/i.components*i.byteLength;case Ya:return s*e*4/i.components*i.byteLength;case vo:case Mo:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*8;case bo:case So:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*16;case Za:case Ja:return Math.max(s,16)*Math.max(e,8)/4;case qa:case Ka:return Math.max(s,8)*Math.max(e,8)/2;case $a:case ja:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*8;case Qa:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*16;case ec:return Math.floor((s+3)/4)*Math.floor((e+3)/4)*16;case tc:return Math.floor((s+4)/5)*Math.floor((e+3)/4)*16;case nc:return Math.floor((s+4)/5)*Math.floor((e+4)/5)*16;case ic:return Math.floor((s+5)/6)*Math.floor((e+4)/5)*16;case sc:return Math.floor((s+5)/6)*Math.floor((e+5)/6)*16;case rc:return Math.floor((s+7)/8)*Math.floor((e+4)/5)*16;case oc:return Math.floor((s+7)/8)*Math.floor((e+5)/6)*16;case ac:return Math.floor((s+7)/8)*Math.floor((e+7)/8)*16;case cc:return Math.floor((s+9)/10)*Math.floor((e+4)/5)*16;case lc:return Math.floor((s+9)/10)*Math.floor((e+5)/6)*16;case hc:return Math.floor((s+9)/10)*Math.floor((e+7)/8)*16;case uc:return Math.floor((s+9)/10)*Math.floor((e+9)/10)*16;case dc:return Math.floor((s+11)/12)*Math.floor((e+9)/10)*16;case fc:return Math.floor((s+11)/12)*Math.floor((e+11)/12)*16;case Eo:case pc:case mc:return Math.ceil(s/4)*Math.ceil(e/4)*16;case zl:case gc:return Math.ceil(s/4)*Math.ceil(e/4)*8;case _c:case xc:return Math.ceil(s/4)*Math.ceil(e/4)*16}throw new Error(`Unable to determine texture byte length for ${t} format.`)}function Em(s){switch(s){case fi:case Pl:return{byteLength:1,components:1};case gr:case Ll:case Qn:return{byteLength:2,components:1};case ka:case Ga:return{byteLength:2,components:4};case es:case Ha:case gn:return{byteLength:4,components:1};case Dl:return{byteLength:4,components:3}}throw new Error(`Unknown texture type ${s}.`)}typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("register",{detail:{revision:"174"}}));typeof window<"u"&&(window.__THREE__?console.warn("WARNING: Multiple instances of Three.js being imported."):window.__THREE__="174");function df(){let s=null,e=!1,t=null,n=null;function i(r,o){t(r,o),n=s.requestAnimationFrame(i)}return{start:function(){e!==!0&&t!==null&&(n=s.requestAnimationFrame(i),e=!0)},stop:function(){s.cancelAnimationFrame(n),e=!1},setAnimationLoop:function(r){t=r},setContext:function(r){s=r}}}function Am(s){let e=new WeakMap;function t(a,c){let l=a.array,h=a.usage,u=l.byteLength,d=s.createBuffer();s.bindBuffer(c,d),s.bufferData(c,l,h),a.onUploadCallback();let p;if(l instanceof Float32Array)p=s.FLOAT;else if(l instanceof Uint16Array)a.isFloat16BufferAttribute?p=s.HALF_FLOAT:p=s.UNSIGNED_SHORT;else if(l instanceof Int16Array)p=s.SHORT;else if(l instanceof Uint32Array)p=s.UNSIGNED_INT;else if(l instanceof Int32Array)p=s.INT;else if(l instanceof Int8Array)p=s.BYTE;else if(l instanceof Uint8Array)p=s.UNSIGNED_BYTE;else if(l instanceof Uint8ClampedArray)p=s.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+l);return{buffer:d,type:p,bytesPerElement:l.BYTES_PER_ELEMENT,version:a.version,size:u}}function n(a,c,l){let h=c.array,u=c.updateRanges;if(s.bindBuffer(l,a),u.length===0)s.bufferSubData(l,0,h);else{u.sort((p,g)=>p.start-g.start);let d=0;for(let p=1;p<u.length;p++){let g=u[d],_=u[p];_.start<=g.start+g.count+1?g.count=Math.max(g.count,_.start+_.count-g.start):(++d,u[d]=_)}u.length=d+1;for(let p=0,g=u.length;p<g;p++){let _=u[p];s.bufferSubData(l,_.start*h.BYTES_PER_ELEMENT,h,_.start,_.count)}c.clearUpdateRanges()}c.onUploadCallback()}function i(a){return a.isInterleavedBufferAttribute&&(a=a.data),e.get(a)}function r(a){a.isInterleavedBufferAttribute&&(a=a.data);let c=e.get(a);c&&(s.deleteBuffer(c.buffer),e.delete(a))}function o(a,c){if(a.isInterleavedBufferAttribute&&(a=a.data),a.isGLBufferAttribute){let h=e.get(a);(!h||h.version<a.version)&&e.set(a,{buffer:a.buffer,type:a.type,bytesPerElement:a.elementSize,version:a.version});return}let l=e.get(a);if(l===void 0)e.set(a,t(a,c));else if(l.version<a.version){if(l.size!==a.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");n(l.buffer,a,c),l.version=a.version}}return{get:i,remove:r,update:o}}var wm=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Rm=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,Cm=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,Im=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Pm=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,Lm=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,Dm=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,Um=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,Nm=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec3 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 ).rgb;
	}
#endif`,Fm=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,Bm=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,Om=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,zm=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,Hm=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,km=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,Gm=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,Vm=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,Wm=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,Xm=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,Ym=`#if defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#elif defined( USE_COLOR )
	diffuseColor.rgb *= vColor;
#endif`,qm=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR )
	varying vec3 vColor;
#endif`,Zm=`#if defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec3 vColor;
#endif`,Km=`#if defined( USE_COLOR_ALPHA )
	vColor = vec4( 1.0 );
#elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec3( 1.0 );
#endif
#ifdef USE_COLOR
	vColor *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.xyz *= instanceColor.xyz;
#endif
#ifdef USE_BATCHING_COLOR
	vec3 batchingColor = getBatchingColor( getIndirectIndex( gl_DrawID ) );
	vColor.xyz *= batchingColor.xyz;
#endif`,Jm=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,$m=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,jm=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
	#ifdef FLIP_SIDED
		transformedTangent = - transformedTangent;
	#endif
#endif`,Qm=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,eg=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,tg=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,ng=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,ig="gl_FragColor = linearToOutputTexel( gl_FragColor );",sg=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,rg=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * vec3( flipEnvMap * reflectVec.x, reflectVec.yz ) );
	#else
		vec4 envColor = vec4( 0.0 );
	#endif
	#ifdef ENVMAP_BLENDING_MULTIPLY
		outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_MIX )
		outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
	#elif defined( ENVMAP_BLENDING_ADD )
		outgoingLight += envColor.xyz * specularStrength * reflectivity;
	#endif
#endif`,og=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform float flipEnvMap;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
	
#endif`,ag=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,cg=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,lg=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,hg=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,ug=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,dg=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,fg=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,pg=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,mg=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,gg=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,_g=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,xg=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif`,yg=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = inverseTransformDirection( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, roughness * roughness) );
			reflectVec = inverseTransformDirection( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,vg=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,Mg=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,bg=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,Sg=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,Eg=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb * ( 1.0 - metalnessFactor );
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = mix( min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = mix( vec3( 0.04 ), diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.07, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,Tg=`struct PhysicalMaterial {
	vec3 diffuseColor;
	float roughness;
	vec3 specularColor;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		float v = 0.5 / ( gv + gl );
		return saturate(v);
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColor;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
	float b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72;
	float DG = exp( a * dotNV + b ) + ( roughness < 0.25 ? 0.0 : 0.1 * ( roughness - 0.25 ) );
	return saturate( DG * RECIPROCAL_PI );
}
vec2 DFGApprox( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	const vec4 c0 = vec4( - 1, - 0.0275, - 0.572, 0.022 );
	const vec4 c1 = vec4( 1, 0.0425, 1.04, - 0.04 );
	vec4 r = roughness * c0 + c1;
	float a004 = min( r.x * r.x, exp2( - 9.28 * dotNV ) ) * r.x + r.y;
	vec2 fab = vec2( - 1.04, 1.04 ) * a004 + r.zw;
	return fab;
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	vec2 fab = DFGApprox( normal, viewDir, roughness );
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColor * t2.x + ( vec3( 1.0 ) - material.specularColor ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
	#endif
	vec3 singleScattering = vec3( 0.0 );
	vec3 multiScattering = vec3( 0.0 );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnel, material.roughness, singleScattering, multiScattering );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScattering, multiScattering );
	#endif
	vec3 totalScattering = singleScattering + multiScattering;
	vec3 diffuse = material.diffuseColor * ( 1.0 - max( max( totalScattering.r, totalScattering.g ), totalScattering.b ) );
	reflectedLight.indirectSpecular += radiance * singleScattering;
	reflectedLight.indirectSpecular += multiScattering * cosineWeightedIrradiance;
	reflectedLight.indirectDiffuse += diffuse * cosineWeightedIrradiance;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,Ag=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnel = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,wg=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD ) && defined( ENVMAP_TYPE_CUBE_UV )
		iblIrradiance += getIBLIrradiance( geometryNormal );
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,Rg=`#if defined( RE_IndirectDiffuse )
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Cg=`#if defined( USE_LOGDEPTHBUF )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,Ig=`#if defined( USE_LOGDEPTHBUF )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Pg=`#ifdef USE_LOGDEPTHBUF
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Lg=`#ifdef USE_LOGDEPTHBUF
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,Dg=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,Ug=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,Ng=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,Fg=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Bg=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,Og=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,zg=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,Hg=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,kg=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Gg=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,Vg=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Wg=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,Xg=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,Yg=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,qg=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Zg=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
	#endif
#endif`,Kg=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,Jg=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,$g=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,jg=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,Qg=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,e0=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,t0=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return depth * ( near - far ) - near;
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	return ( near * far ) / ( ( far - near ) * depth - far );
}`,n0=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,i0=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,s0=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,r0=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,o0=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,a0=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,c0=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform sampler2D pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	float texture2DCompare( sampler2D depths, vec2 uv, float compare ) {
		return step( compare, unpackRGBAToDepth( texture2D( depths, uv ) ) );
	}
	vec2 texture2DDistribution( sampler2D shadow, vec2 uv ) {
		return unpackRGBATo2Half( texture2D( shadow, uv ) );
	}
	float VSMShadow (sampler2D shadow, vec2 uv, float compare ){
		float occlusion = 1.0;
		vec2 distribution = texture2DDistribution( shadow, uv );
		float hard_shadow = step( compare , distribution.x );
		if (hard_shadow != 1.0 ) {
			float distance = compare - distribution.x ;
			float variance = max( 0.00000, distribution.y * distribution.y );
			float softness_probability = variance / (variance + distance * distance );			softness_probability = clamp( ( softness_probability - 0.3 ) / ( 0.95 - 0.3 ), 0.0, 1.0 );			occlusion = clamp( max( hard_shadow, softness_probability ), 0.0, 1.0 );
		}
		return occlusion;
	}
	float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
		float shadow = 1.0;
		shadowCoord.xyz /= shadowCoord.w;
		shadowCoord.z += shadowBias;
		bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
		bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
		if ( frustumTest ) {
		#if defined( SHADOWMAP_TYPE_PCF )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx0 = - texelSize.x * shadowRadius;
			float dy0 = - texelSize.y * shadowRadius;
			float dx1 = + texelSize.x * shadowRadius;
			float dy1 = + texelSize.y * shadowRadius;
			float dx2 = dx0 / 2.0;
			float dy2 = dy0 / 2.0;
			float dx3 = dx1 / 2.0;
			float dy3 = dy1 / 2.0;
			shadow = (
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy2 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx2, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx3, dy3 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( 0.0, dy1 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, shadowCoord.xy + vec2( dx1, dy1 ), shadowCoord.z )
			) * ( 1.0 / 17.0 );
		#elif defined( SHADOWMAP_TYPE_PCF_SOFT )
			vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
			float dx = texelSize.x;
			float dy = texelSize.y;
			vec2 uv = shadowCoord.xy;
			vec2 f = fract( uv * shadowMapSize + 0.5 );
			uv -= f * texelSize;
			shadow = (
				texture2DCompare( shadowMap, uv, shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( dx, 0.0 ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + vec2( 0.0, dy ), shadowCoord.z ) +
				texture2DCompare( shadowMap, uv + texelSize, shadowCoord.z ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, 0.0 ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 0.0 ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( -dx, dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, dy ), shadowCoord.z ),
					 f.x ) +
				mix( texture2DCompare( shadowMap, uv + vec2( 0.0, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( 0.0, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( texture2DCompare( shadowMap, uv + vec2( dx, -dy ), shadowCoord.z ),
					 texture2DCompare( shadowMap, uv + vec2( dx, 2.0 * dy ), shadowCoord.z ),
					 f.y ) +
				mix( mix( texture2DCompare( shadowMap, uv + vec2( -dx, -dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, -dy ), shadowCoord.z ),
						  f.x ),
					 mix( texture2DCompare( shadowMap, uv + vec2( -dx, 2.0 * dy ), shadowCoord.z ),
						  texture2DCompare( shadowMap, uv + vec2( 2.0 * dx, 2.0 * dy ), shadowCoord.z ),
						  f.x ),
					 f.y )
			) * ( 1.0 / 9.0 );
		#elif defined( SHADOWMAP_TYPE_VSM )
			shadow = VSMShadow( shadowMap, shadowCoord.xy, shadowCoord.z );
		#else
			shadow = texture2DCompare( shadowMap, shadowCoord.xy, shadowCoord.z );
		#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	vec2 cubeToUV( vec3 v, float texelSizeY ) {
		vec3 absV = abs( v );
		float scaleToCube = 1.0 / max( absV.x, max( absV.y, absV.z ) );
		absV *= scaleToCube;
		v *= scaleToCube * ( 1.0 - 2.0 * texelSizeY );
		vec2 planar = v.xy;
		float almostATexel = 1.5 * texelSizeY;
		float almostOne = 1.0 - almostATexel;
		if ( absV.z >= almostOne ) {
			if ( v.z > 0.0 )
				planar.x = 4.0 - v.x;
		} else if ( absV.x >= almostOne ) {
			float signX = sign( v.x );
			planar.x = v.z * signX + 2.0 * signX;
		} else if ( absV.y >= almostOne ) {
			float signY = sign( v.y );
			planar.x = v.x + 2.0 * signY + 2.0;
			planar.y = v.z * signY - 2.0;
		}
		return vec2( 0.125, 0.25 ) * planar + vec2( 0.375, 0.75 );
	}
	float getPointShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		
		float lightToPositionLength = length( lightToPosition );
		if ( lightToPositionLength - shadowCameraFar <= 0.0 && lightToPositionLength - shadowCameraNear >= 0.0 ) {
			float dp = ( lightToPositionLength - shadowCameraNear ) / ( shadowCameraFar - shadowCameraNear );			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			vec2 texelSize = vec2( 1.0 ) / ( shadowMapSize * vec2( 4.0, 2.0 ) );
			#if defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_PCF_SOFT ) || defined( SHADOWMAP_TYPE_VSM )
				vec2 offset = vec2( - 1, 1 ) * shadowRadius * texelSize.y;
				shadow = (
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yyx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxy, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.xxx, texelSize.y ), dp ) +
					texture2DCompare( shadowMap, cubeToUV( bd3D + offset.yxx, texelSize.y ), dp )
				) * ( 1.0 / 9.0 );
			#else
				shadow = texture2DCompare( shadowMap, cubeToUV( bd3D, texelSize.y ), dp );
			#endif
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
#endif`,l0=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,h0=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	vec3 shadowWorldNormal = inverseTransformDirection( transformedNormal, viewMatrix );
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,u0=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,d0=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,f0=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,p0=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,m0=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,g0=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,_0=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,x0=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,y0=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,v0=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = inverseTransformDirection( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseColor, material.specularColor, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,M0=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,b0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,S0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,E0=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,T0=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`,A0=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,w0=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,R0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,C0=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float flipEnvMap;
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vec3( flipEnvMap * vWorldDirection.x, vWorldDirection.yz ) );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,I0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,P0=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,L0=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,D0=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	float fragCoordZ = 0.5 * vHighPrecisionZW[0] / vHighPrecisionZW[1] + 0.5;
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,U0=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,N0=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main () {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = packDepthToRGBA( dist );
}`,F0=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,B0=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,O0=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,z0=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,H0=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,k0=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,G0=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,V0=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,W0=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,X0=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Y0=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,q0=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <packing>
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( packNormalToRGB( normal ), diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,Z0=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,K0=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,J0=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,$0=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
		float sheenEnergyComp = 1.0 - 0.157 * max3( material.sheenColor );
		outgoingLight = outgoingLight * sheenEnergyComp + sheenSpecularDirect + sheenSpecularIndirect;
	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,j0=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Q0=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <packing>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,e_=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,t_=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,n_=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,i_=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <packing>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,s_=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,r_=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,lt={alphahash_fragment:wm,alphahash_pars_fragment:Rm,alphamap_fragment:Cm,alphamap_pars_fragment:Im,alphatest_fragment:Pm,alphatest_pars_fragment:Lm,aomap_fragment:Dm,aomap_pars_fragment:Um,batching_pars_vertex:Nm,batching_vertex:Fm,begin_vertex:Bm,beginnormal_vertex:Om,bsdfs:zm,iridescence_fragment:Hm,bumpmap_pars_fragment:km,clipping_planes_fragment:Gm,clipping_planes_pars_fragment:Vm,clipping_planes_pars_vertex:Wm,clipping_planes_vertex:Xm,color_fragment:Ym,color_pars_fragment:qm,color_pars_vertex:Zm,color_vertex:Km,common:Jm,cube_uv_reflection_fragment:$m,defaultnormal_vertex:jm,displacementmap_pars_vertex:Qm,displacementmap_vertex:eg,emissivemap_fragment:tg,emissivemap_pars_fragment:ng,colorspace_fragment:ig,colorspace_pars_fragment:sg,envmap_fragment:rg,envmap_common_pars_fragment:og,envmap_pars_fragment:ag,envmap_pars_vertex:cg,envmap_physical_pars_fragment:yg,envmap_vertex:lg,fog_vertex:hg,fog_pars_vertex:ug,fog_fragment:dg,fog_pars_fragment:fg,gradientmap_pars_fragment:pg,lightmap_pars_fragment:mg,lights_lambert_fragment:gg,lights_lambert_pars_fragment:_g,lights_pars_begin:xg,lights_toon_fragment:vg,lights_toon_pars_fragment:Mg,lights_phong_fragment:bg,lights_phong_pars_fragment:Sg,lights_physical_fragment:Eg,lights_physical_pars_fragment:Tg,lights_fragment_begin:Ag,lights_fragment_maps:wg,lights_fragment_end:Rg,logdepthbuf_fragment:Cg,logdepthbuf_pars_fragment:Ig,logdepthbuf_pars_vertex:Pg,logdepthbuf_vertex:Lg,map_fragment:Dg,map_pars_fragment:Ug,map_particle_fragment:Ng,map_particle_pars_fragment:Fg,metalnessmap_fragment:Bg,metalnessmap_pars_fragment:Og,morphinstance_vertex:zg,morphcolor_vertex:Hg,morphnormal_vertex:kg,morphtarget_pars_vertex:Gg,morphtarget_vertex:Vg,normal_fragment_begin:Wg,normal_fragment_maps:Xg,normal_pars_fragment:Yg,normal_pars_vertex:qg,normal_vertex:Zg,normalmap_pars_fragment:Kg,clearcoat_normal_fragment_begin:Jg,clearcoat_normal_fragment_maps:$g,clearcoat_pars_fragment:jg,iridescence_pars_fragment:Qg,opaque_fragment:e0,packing:t0,premultiplied_alpha_fragment:n0,project_vertex:i0,dithering_fragment:s0,dithering_pars_fragment:r0,roughnessmap_fragment:o0,roughnessmap_pars_fragment:a0,shadowmap_pars_fragment:c0,shadowmap_pars_vertex:l0,shadowmap_vertex:h0,shadowmask_pars_fragment:u0,skinbase_vertex:d0,skinning_pars_vertex:f0,skinning_vertex:p0,skinnormal_vertex:m0,specularmap_fragment:g0,specularmap_pars_fragment:_0,tonemapping_fragment:x0,tonemapping_pars_fragment:y0,transmission_fragment:v0,transmission_pars_fragment:M0,uv_pars_fragment:b0,uv_pars_vertex:S0,uv_vertex:E0,worldpos_vertex:T0,background_vert:A0,background_frag:w0,backgroundCube_vert:R0,backgroundCube_frag:C0,cube_vert:I0,cube_frag:P0,depth_vert:L0,depth_frag:D0,distanceRGBA_vert:U0,distanceRGBA_frag:N0,equirect_vert:F0,equirect_frag:B0,linedashed_vert:O0,linedashed_frag:z0,meshbasic_vert:H0,meshbasic_frag:k0,meshlambert_vert:G0,meshlambert_frag:V0,meshmatcap_vert:W0,meshmatcap_frag:X0,meshnormal_vert:Y0,meshnormal_frag:q0,meshphong_vert:Z0,meshphong_frag:K0,meshphysical_vert:J0,meshphysical_frag:$0,meshtoon_vert:j0,meshtoon_frag:Q0,points_vert:e_,points_frag:t_,shadow_vert:n_,shadow_frag:i_,sprite_vert:s_,sprite_frag:r_},Me={common:{diffuse:{value:new ge(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Qe},alphaMap:{value:null},alphaMapTransform:{value:new Qe},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Qe}},envmap:{envMap:{value:null},envMapRotation:{value:new Qe},flipEnvMap:{value:-1},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Qe}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Qe}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Qe},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Qe},normalScale:{value:new ke(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Qe},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Qe}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Qe}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Qe}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new ge(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMap:{value:[]},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotShadowMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMap:{value:[]},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null}},points:{diffuse:{value:new ge(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Qe},alphaTest:{value:0},uvTransform:{value:new Qe}},sprite:{diffuse:{value:new ge(16777215)},opacity:{value:1},center:{value:new ke(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Qe},alphaMap:{value:null},alphaMapTransform:{value:new Qe},alphaTest:{value:0}}},pi={basic:{uniforms:_n([Me.common,Me.specularmap,Me.envmap,Me.aomap,Me.lightmap,Me.fog]),vertexShader:lt.meshbasic_vert,fragmentShader:lt.meshbasic_frag},lambert:{uniforms:_n([Me.common,Me.specularmap,Me.envmap,Me.aomap,Me.lightmap,Me.emissivemap,Me.bumpmap,Me.normalmap,Me.displacementmap,Me.fog,Me.lights,{emissive:{value:new ge(0)}}]),vertexShader:lt.meshlambert_vert,fragmentShader:lt.meshlambert_frag},phong:{uniforms:_n([Me.common,Me.specularmap,Me.envmap,Me.aomap,Me.lightmap,Me.emissivemap,Me.bumpmap,Me.normalmap,Me.displacementmap,Me.fog,Me.lights,{emissive:{value:new ge(0)},specular:{value:new ge(1118481)},shininess:{value:30}}]),vertexShader:lt.meshphong_vert,fragmentShader:lt.meshphong_frag},standard:{uniforms:_n([Me.common,Me.envmap,Me.aomap,Me.lightmap,Me.emissivemap,Me.bumpmap,Me.normalmap,Me.displacementmap,Me.roughnessmap,Me.metalnessmap,Me.fog,Me.lights,{emissive:{value:new ge(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:lt.meshphysical_vert,fragmentShader:lt.meshphysical_frag},toon:{uniforms:_n([Me.common,Me.aomap,Me.lightmap,Me.emissivemap,Me.bumpmap,Me.normalmap,Me.displacementmap,Me.gradientmap,Me.fog,Me.lights,{emissive:{value:new ge(0)}}]),vertexShader:lt.meshtoon_vert,fragmentShader:lt.meshtoon_frag},matcap:{uniforms:_n([Me.common,Me.bumpmap,Me.normalmap,Me.displacementmap,Me.fog,{matcap:{value:null}}]),vertexShader:lt.meshmatcap_vert,fragmentShader:lt.meshmatcap_frag},points:{uniforms:_n([Me.points,Me.fog]),vertexShader:lt.points_vert,fragmentShader:lt.points_frag},dashed:{uniforms:_n([Me.common,Me.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:lt.linedashed_vert,fragmentShader:lt.linedashed_frag},depth:{uniforms:_n([Me.common,Me.displacementmap]),vertexShader:lt.depth_vert,fragmentShader:lt.depth_frag},normal:{uniforms:_n([Me.common,Me.bumpmap,Me.normalmap,Me.displacementmap,{opacity:{value:1}}]),vertexShader:lt.meshnormal_vert,fragmentShader:lt.meshnormal_frag},sprite:{uniforms:_n([Me.sprite,Me.fog]),vertexShader:lt.sprite_vert,fragmentShader:lt.sprite_frag},background:{uniforms:{uvTransform:{value:new Qe},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:lt.background_vert,fragmentShader:lt.background_frag},backgroundCube:{uniforms:{envMap:{value:null},flipEnvMap:{value:-1},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Qe}},vertexShader:lt.backgroundCube_vert,fragmentShader:lt.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:lt.cube_vert,fragmentShader:lt.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:lt.equirect_vert,fragmentShader:lt.equirect_frag},distanceRGBA:{uniforms:_n([Me.common,Me.displacementmap,{referencePosition:{value:new D},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:lt.distanceRGBA_vert,fragmentShader:lt.distanceRGBA_frag},shadow:{uniforms:_n([Me.lights,Me.fog,{color:{value:new ge(0)},opacity:{value:1}}]),vertexShader:lt.shadow_vert,fragmentShader:lt.shadow_frag}};pi.physical={uniforms:_n([pi.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Qe},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Qe},clearcoatNormalScale:{value:new ke(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Qe},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Qe},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Qe},sheen:{value:0},sheenColor:{value:new ge(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Qe},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Qe},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Qe},transmissionSamplerSize:{value:new ke},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Qe},attenuationDistance:{value:0},attenuationColor:{value:new ge(0)},specularColor:{value:new ge(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Qe},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Qe},anisotropyVector:{value:new ke},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Qe}}]),vertexShader:lt.meshphysical_vert,fragmentShader:lt.meshphysical_frag};var yc={r:0,b:0,g:0},Fs=new Kn,o_=new Ze;function a_(s,e,t,n,i,r,o){let a=new ge(0),c=r===!0?0:1,l,h,u=null,d=0,p=null;function g(S){let x=S.isScene===!0?S.background:null;return x&&x.isTexture&&(x=(S.backgroundBlurriness>0?t:e).get(x)),x}function _(S){let x=!1,P=g(S);P===null?f(a,c):P&&P.isColor&&(f(P,1),x=!0);let T=s.xr.getEnvironmentBlendMode();T==="additive"?n.buffers.color.setClear(0,0,0,1,o):T==="alpha-blend"&&n.buffers.color.setClear(0,0,0,0,o),(s.autoClear||x)&&(n.buffers.depth.setTest(!0),n.buffers.depth.setMask(!0),n.buffers.color.setMask(!0),s.clear(s.autoClearColor,s.autoClearDepth,s.autoClearStencil))}function m(S,x){let P=g(x);P&&(P.isCubeTexture||P.mapping===yo)?(h===void 0&&(h=new we(new pn(1,1,1),new Jn({name:"BackgroundCubeMaterial",uniforms:Ns(pi.backgroundCube.uniforms),vertexShader:pi.backgroundCube.vertexShader,fragmentShader:pi.backgroundCube.fragmentShader,side:Vt,depthTest:!1,depthWrite:!1,fog:!1})),h.geometry.deleteAttribute("normal"),h.geometry.deleteAttribute("uv"),h.onBeforeRender=function(T,w,R){this.matrixWorld.copyPosition(R.matrixWorld)},Object.defineProperty(h.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(h)),Fs.copy(x.backgroundRotation),Fs.x*=-1,Fs.y*=-1,Fs.z*=-1,P.isCubeTexture&&P.isRenderTargetTexture===!1&&(Fs.y*=-1,Fs.z*=-1),h.material.uniforms.envMap.value=P,h.material.uniforms.flipEnvMap.value=P.isCubeTexture&&P.isRenderTargetTexture===!1?-1:1,h.material.uniforms.backgroundBlurriness.value=x.backgroundBlurriness,h.material.uniforms.backgroundIntensity.value=x.backgroundIntensity,h.material.uniforms.backgroundRotation.value.setFromMatrix4(o_.makeRotationFromEuler(Fs)),h.material.toneMapped=ft.getTransfer(P.colorSpace)!==At,(u!==P||d!==P.version||p!==s.toneMapping)&&(h.material.needsUpdate=!0,u=P,d=P.version,p=s.toneMapping),h.layers.enableAll(),S.unshift(h,h.geometry,h.material,0,0,null)):P&&P.isTexture&&(l===void 0&&(l=new we(new jt(2,2),new Jn({name:"BackgroundMaterial",uniforms:Ns(pi.background.uniforms),vertexShader:pi.background.vertexShader,fragmentShader:pi.background.fragmentShader,side:Zn,depthTest:!1,depthWrite:!1,fog:!1})),l.geometry.deleteAttribute("normal"),Object.defineProperty(l.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(l)),l.material.uniforms.t2D.value=P,l.material.uniforms.backgroundIntensity.value=x.backgroundIntensity,l.material.toneMapped=ft.getTransfer(P.colorSpace)!==At,P.matrixAutoUpdate===!0&&P.updateMatrix(),l.material.uniforms.uvTransform.value.copy(P.matrix),(u!==P||d!==P.version||p!==s.toneMapping)&&(l.material.needsUpdate=!0,u=P,d=P.version,p=s.toneMapping),l.layers.enableAll(),S.unshift(l,l.geometry,l.material,0,0,null))}function f(S,x){S.getRGB(yc,ql(s)),n.buffers.color.setClear(yc.r,yc.g,yc.b,x,o)}function v(){h!==void 0&&(h.geometry.dispose(),h.material.dispose(),h=void 0),l!==void 0&&(l.geometry.dispose(),l.material.dispose(),l=void 0)}return{getClearColor:function(){return a},setClearColor:function(S,x=1){a.set(S),c=x,f(a,c)},getClearAlpha:function(){return c},setClearAlpha:function(S){c=S,f(a,c)},render:_,addToRenderList:m,dispose:v}}function c_(s,e){let t=s.getParameter(s.MAX_VERTEX_ATTRIBS),n={},i=d(null),r=i,o=!1;function a(y,I,F,U,O){let $=!1,k=u(U,F,I);r!==k&&(r=k,l(r.object)),$=p(y,U,F,O),$&&g(y,U,F,O),O!==null&&e.update(O,s.ELEMENT_ARRAY_BUFFER),($||o)&&(o=!1,x(y,I,F,U),O!==null&&s.bindBuffer(s.ELEMENT_ARRAY_BUFFER,e.get(O).buffer))}function c(){return s.createVertexArray()}function l(y){return s.bindVertexArray(y)}function h(y){return s.deleteVertexArray(y)}function u(y,I,F){let U=F.wireframe===!0,O=n[y.id];O===void 0&&(O={},n[y.id]=O);let $=O[I.id];$===void 0&&($={},O[I.id]=$);let k=$[U];return k===void 0&&(k=d(c()),$[U]=k),k}function d(y){let I=[],F=[],U=[];for(let O=0;O<t;O++)I[O]=0,F[O]=0,U[O]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:I,enabledAttributes:F,attributeDivisors:U,object:y,attributes:{},index:null}}function p(y,I,F,U){let O=r.attributes,$=I.attributes,k=0,ee=F.getAttributes();for(let Y in ee)if(ee[Y].location>=0){let pe=O[Y],Ie=$[Y];if(Ie===void 0&&(Y==="instanceMatrix"&&y.instanceMatrix&&(Ie=y.instanceMatrix),Y==="instanceColor"&&y.instanceColor&&(Ie=y.instanceColor)),pe===void 0||pe.attribute!==Ie||Ie&&pe.data!==Ie.data)return!0;k++}return r.attributesNum!==k||r.index!==U}function g(y,I,F,U){let O={},$=I.attributes,k=0,ee=F.getAttributes();for(let Y in ee)if(ee[Y].location>=0){let pe=$[Y];pe===void 0&&(Y==="instanceMatrix"&&y.instanceMatrix&&(pe=y.instanceMatrix),Y==="instanceColor"&&y.instanceColor&&(pe=y.instanceColor));let Ie={};Ie.attribute=pe,pe&&pe.data&&(Ie.data=pe.data),O[Y]=Ie,k++}r.attributes=O,r.attributesNum=k,r.index=U}function _(){let y=r.newAttributes;for(let I=0,F=y.length;I<F;I++)y[I]=0}function m(y){f(y,0)}function f(y,I){let F=r.newAttributes,U=r.enabledAttributes,O=r.attributeDivisors;F[y]=1,U[y]===0&&(s.enableVertexAttribArray(y),U[y]=1),O[y]!==I&&(s.vertexAttribDivisor(y,I),O[y]=I)}function v(){let y=r.newAttributes,I=r.enabledAttributes;for(let F=0,U=I.length;F<U;F++)I[F]!==y[F]&&(s.disableVertexAttribArray(F),I[F]=0)}function S(y,I,F,U,O,$,k){k===!0?s.vertexAttribIPointer(y,I,F,O,$):s.vertexAttribPointer(y,I,F,U,O,$)}function x(y,I,F,U){_();let O=U.attributes,$=F.getAttributes(),k=I.defaultAttributeValues;for(let ee in $){let Y=$[ee];if(Y.location>=0){let ce=O[ee];if(ce===void 0&&(ee==="instanceMatrix"&&y.instanceMatrix&&(ce=y.instanceMatrix),ee==="instanceColor"&&y.instanceColor&&(ce=y.instanceColor)),ce!==void 0){let pe=ce.normalized,Ie=ce.itemSize,Ue=e.get(ce);if(Ue===void 0)continue;let Ge=Ue.buffer,te=Ue.type,ue=Ue.bytesPerElement,Ae=te===s.INT||te===s.UNSIGNED_INT||ce.gpuType===Ha;if(ce.isInterleavedBufferAttribute){let ye=ce.data,Be=ye.stride,qe=ce.offset;if(ye.isInstancedInterleavedBuffer){for(let Fe=0;Fe<Y.locationSize;Fe++)f(Y.location+Fe,ye.meshPerAttribute);y.isInstancedMesh!==!0&&U._maxInstanceCount===void 0&&(U._maxInstanceCount=ye.meshPerAttribute*ye.count)}else for(let Fe=0;Fe<Y.locationSize;Fe++)m(Y.location+Fe);s.bindBuffer(s.ARRAY_BUFFER,Ge);for(let Fe=0;Fe<Y.locationSize;Fe++)S(Y.location+Fe,Ie/Y.locationSize,te,pe,Be*ue,(qe+Ie/Y.locationSize*Fe)*ue,Ae)}else{if(ce.isInstancedBufferAttribute){for(let ye=0;ye<Y.locationSize;ye++)f(Y.location+ye,ce.meshPerAttribute);y.isInstancedMesh!==!0&&U._maxInstanceCount===void 0&&(U._maxInstanceCount=ce.meshPerAttribute*ce.count)}else for(let ye=0;ye<Y.locationSize;ye++)m(Y.location+ye);s.bindBuffer(s.ARRAY_BUFFER,Ge);for(let ye=0;ye<Y.locationSize;ye++)S(Y.location+ye,Ie/Y.locationSize,te,pe,Ie*ue,Ie/Y.locationSize*ye*ue,Ae)}}else if(k!==void 0){let pe=k[ee];if(pe!==void 0)switch(pe.length){case 2:s.vertexAttrib2fv(Y.location,pe);break;case 3:s.vertexAttrib3fv(Y.location,pe);break;case 4:s.vertexAttrib4fv(Y.location,pe);break;default:s.vertexAttrib1fv(Y.location,pe)}}}}v()}function P(){R();for(let y in n){let I=n[y];for(let F in I){let U=I[F];for(let O in U)h(U[O].object),delete U[O];delete I[F]}delete n[y]}}function T(y){if(n[y.id]===void 0)return;let I=n[y.id];for(let F in I){let U=I[F];for(let O in U)h(U[O].object),delete U[O];delete I[F]}delete n[y.id]}function w(y){for(let I in n){let F=n[I];if(F[y.id]===void 0)continue;let U=F[y.id];for(let O in U)h(U[O].object),delete U[O];delete F[y.id]}}function R(){M(),o=!0,r!==i&&(r=i,l(r.object))}function M(){i.geometry=null,i.program=null,i.wireframe=!1}return{setup:a,reset:R,resetDefaultState:M,dispose:P,releaseStatesOfGeometry:T,releaseStatesOfProgram:w,initAttributes:_,enableAttribute:m,disableUnusedAttributes:v}}function l_(s,e,t){let n;function i(l){n=l}function r(l,h){s.drawArrays(n,l,h),t.update(h,n,1)}function o(l,h,u){u!==0&&(s.drawArraysInstanced(n,l,h,u),t.update(h,n,u))}function a(l,h,u){if(u===0)return;e.get("WEBGL_multi_draw").multiDrawArraysWEBGL(n,l,0,h,0,u);let p=0;for(let g=0;g<u;g++)p+=h[g];t.update(p,n,1)}function c(l,h,u,d){if(u===0)return;let p=e.get("WEBGL_multi_draw");if(p===null)for(let g=0;g<l.length;g++)o(l[g],h[g],d[g]);else{p.multiDrawArraysInstancedWEBGL(n,l,0,h,0,d,0,u);let g=0;for(let _=0;_<u;_++)g+=h[_]*d[_];t.update(g,n,1)}}this.setMode=i,this.render=r,this.renderInstances=o,this.renderMultiDraw=a,this.renderMultiDrawInstances=c}function h_(s,e,t,n){let i;function r(){if(i!==void 0)return i;if(e.has("EXT_texture_filter_anisotropic")===!0){let w=e.get("EXT_texture_filter_anisotropic");i=s.getParameter(w.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else i=0;return i}function o(w){return!(w!==Pn&&n.convert(w)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_FORMAT))}function a(w){let R=w===Qn&&(e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float"));return!(w!==fi&&n.convert(w)!==s.getParameter(s.IMPLEMENTATION_COLOR_READ_TYPE)&&w!==gn&&!R)}function c(w){if(w==="highp"){if(s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.HIGH_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.HIGH_FLOAT).precision>0)return"highp";w="mediump"}return w==="mediump"&&s.getShaderPrecisionFormat(s.VERTEX_SHADER,s.MEDIUM_FLOAT).precision>0&&s.getShaderPrecisionFormat(s.FRAGMENT_SHADER,s.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let l=t.precision!==void 0?t.precision:"highp",h=c(l);h!==l&&(console.warn("THREE.WebGLRenderer:",l,"not supported, using",h,"instead."),l=h);let u=t.logarithmicDepthBuffer===!0,d=t.reverseDepthBuffer===!0&&e.has("EXT_clip_control"),p=s.getParameter(s.MAX_TEXTURE_IMAGE_UNITS),g=s.getParameter(s.MAX_VERTEX_TEXTURE_IMAGE_UNITS),_=s.getParameter(s.MAX_TEXTURE_SIZE),m=s.getParameter(s.MAX_CUBE_MAP_TEXTURE_SIZE),f=s.getParameter(s.MAX_VERTEX_ATTRIBS),v=s.getParameter(s.MAX_VERTEX_UNIFORM_VECTORS),S=s.getParameter(s.MAX_VARYING_VECTORS),x=s.getParameter(s.MAX_FRAGMENT_UNIFORM_VECTORS),P=g>0,T=s.getParameter(s.MAX_SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:r,getMaxPrecision:c,textureFormatReadable:o,textureTypeReadable:a,precision:l,logarithmicDepthBuffer:u,reverseDepthBuffer:d,maxTextures:p,maxVertexTextures:g,maxTextureSize:_,maxCubemapSize:m,maxAttributes:f,maxVertexUniforms:v,maxVaryings:S,maxFragmentUniforms:x,vertexTextures:P,maxSamples:T}}function u_(s){let e=this,t=null,n=0,i=!1,r=!1,o=new ri,a=new Qe,c={value:null,needsUpdate:!1};this.uniform=c,this.numPlanes=0,this.numIntersection=0,this.init=function(u,d){let p=u.length!==0||d||n!==0||i;return i=d,n=u.length,p},this.beginShadows=function(){r=!0,h(null)},this.endShadows=function(){r=!1},this.setGlobalState=function(u,d){t=h(u,d,0)},this.setState=function(u,d,p){let g=u.clippingPlanes,_=u.clipIntersection,m=u.clipShadows,f=s.get(u);if(!i||g===null||g.length===0||r&&!m)r?h(null):l();else{let v=r?0:n,S=v*4,x=f.clippingState||null;c.value=x,x=h(g,d,S,p);for(let P=0;P!==S;++P)x[P]=t[P];f.clippingState=x,this.numIntersection=_?this.numPlanes:0,this.numPlanes+=v}};function l(){c.value!==t&&(c.value=t,c.needsUpdate=n>0),e.numPlanes=n,e.numIntersection=0}function h(u,d,p,g){let _=u!==null?u.length:0,m=null;if(_!==0){if(m=c.value,g!==!0||m===null){let f=p+_*4,v=d.matrixWorldInverse;a.getNormalMatrix(v),(m===null||m.length<f)&&(m=new Float32Array(f));for(let S=0,x=p;S!==_;++S,x+=4)o.copy(u[S]).applyMatrix4(v,a),o.normal.toArray(m,x),m[x+3]=o.constant}c.value=m,c.needsUpdate=!0}return e.numPlanes=_,e.numIntersection=0,m}}function d_(s){let e=new WeakMap;function t(o,a){return a===Ls?o.mapping=Is:a===Oa&&(o.mapping=Ps),o}function n(o){if(o&&o.isTexture){let a=o.mapping;if(a===Ls||a===Oa)if(e.has(o)){let c=e.get(o).texture;return t(c,o.mapping)}else{let c=o.image;if(c&&c.height>0){let l=new _a(c.height);return l.fromEquirectangularTexture(s,o),e.set(o,l),o.addEventListener("dispose",i),t(l.texture,o.mapping)}else return null}}return o}function i(o){let a=o.target;a.removeEventListener("dispose",i);let c=e.get(a);c!==void 0&&(e.delete(a),c.dispose())}function r(){e=new WeakMap}return{get:n,dispose:r}}var yr=4,Gd=[.125,.215,.35,.446,.526,.582],zs=20,$l=new Cs,Vd=new ge,jl=null,Ql=0,eh=0,th=!1,Os=(1+Math.sqrt(5))/2,xr=1/Os,Wd=[new D(-Os,xr,0),new D(Os,xr,0),new D(-xr,0,Os),new D(xr,0,Os),new D(0,Os,-xr),new D(0,Os,xr),new D(-1,1,-1),new D(1,1,-1),new D(-1,1,1),new D(1,1,1)],f_=new D,Mr=class{constructor(e){this._renderer=e,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._lodPlanes=[],this._sizeLods=[],this._sigmas=[],this._blurMaterial=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._compileMaterial(this._blurMaterial)}fromScene(e,t=0,n=.1,i=100,r={}){let{size:o=256,position:a=f_}=r;jl=this._renderer.getRenderTarget(),Ql=this._renderer.getActiveCubeFace(),eh=this._renderer.getActiveMipmapLevel(),th=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(o);let c=this._allocateTargets();return c.depthBuffer=!0,this._sceneToCubeUV(e,n,i,c,a),t>0&&this._blur(c,0,0,t),this._applyPMREM(c),this._cleanup(c),c}fromEquirectangular(e,t=null){return this._fromTexture(e,t)}fromCubemap(e,t=null){return this._fromTexture(e,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=qd(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Yd(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose()}_setSize(e){this._lodMax=Math.floor(Math.log2(e)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let e=0;e<this._lodPlanes.length;e++)this._lodPlanes[e].dispose()}_cleanup(e){this._renderer.setRenderTarget(jl,Ql,eh),this._renderer.xr.enabled=th,e.scissorTest=!1,vc(e,0,0,e.width,e.height)}_fromTexture(e,t){e.mapping===Is||e.mapping===Ps?this._setSize(e.image.length===0?16:e.image[0].width||e.image[0].image.width):this._setSize(e.image.width/4),jl=this._renderer.getRenderTarget(),Ql=this._renderer.getActiveCubeFace(),eh=this._renderer.getActiveMipmapLevel(),th=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;let n=t||this._allocateTargets();return this._textureToCubeUV(e,n),this._applyPMREM(n),this._cleanup(n),n}_allocateTargets(){let e=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,n={magFilter:Nt,minFilter:Nt,generateMipmaps:!1,type:Qn,format:Pn,colorSpace:Jt,depthBuffer:!1},i=Xd(e,t,n);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==e||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=Xd(e,t,n);let{_lodMax:r}=this;({sizeLods:this._sizeLods,lodPlanes:this._lodPlanes,sigmas:this._sigmas}=p_(r)),this._blurMaterial=m_(r,e,t)}return i}_compileMaterial(e){let t=new we(this._lodPlanes[0],e);this._renderer.compile(t,$l)}_sceneToCubeUV(e,t,n,i,r){let c=new Yt(90,1,t,n),l=[1,-1,1,1,1,1],h=[1,1,1,-1,-1,-1],u=this._renderer,d=u.autoClear,p=u.toneMapping;u.getClearColor(Vd),u.toneMapping=Ni,u.autoClear=!1;let g=new wt({name:"PMREM.Background",side:Vt,depthWrite:!1,depthTest:!1}),_=new we(new pn,g),m=!1,f=e.background;f?f.isColor&&(g.color.copy(f),e.background=null,m=!0):(g.color.copy(Vd),m=!0);for(let v=0;v<6;v++){let S=v%3;S===0?(c.up.set(0,l[v],0),c.position.set(r.x,r.y,r.z),c.lookAt(r.x+h[v],r.y,r.z)):S===1?(c.up.set(0,0,l[v]),c.position.set(r.x,r.y,r.z),c.lookAt(r.x,r.y+h[v],r.z)):(c.up.set(0,l[v],0),c.position.set(r.x,r.y,r.z),c.lookAt(r.x,r.y,r.z+h[v]));let x=this._cubeSize;vc(i,S*x,v>2?x:0,x,x),u.setRenderTarget(i),m&&u.render(_,c),u.render(e,c)}_.geometry.dispose(),_.material.dispose(),u.toneMapping=p,u.autoClear=d,e.background=f}_textureToCubeUV(e,t){let n=this._renderer,i=e.mapping===Is||e.mapping===Ps;i?(this._cubemapMaterial===null&&(this._cubemapMaterial=qd()),this._cubemapMaterial.uniforms.flipEnvMap.value=e.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Yd());let r=i?this._cubemapMaterial:this._equirectMaterial,o=new we(this._lodPlanes[0],r),a=r.uniforms;a.envMap.value=e;let c=this._cubeSize;vc(t,0,0,3*c,2*c),n.setRenderTarget(t),n.render(o,$l)}_applyPMREM(e){let t=this._renderer,n=t.autoClear;t.autoClear=!1;let i=this._lodPlanes.length;for(let r=1;r<i;r++){let o=Math.sqrt(this._sigmas[r]*this._sigmas[r]-this._sigmas[r-1]*this._sigmas[r-1]),a=Wd[(i-r-1)%Wd.length];this._blur(e,r-1,r,o,a)}t.autoClear=n}_blur(e,t,n,i,r){let o=this._pingPongRenderTarget;this._halfBlur(e,o,t,n,i,"latitudinal",r),this._halfBlur(o,e,n,n,i,"longitudinal",r)}_halfBlur(e,t,n,i,r,o,a){let c=this._renderer,l=this._blurMaterial;o!=="latitudinal"&&o!=="longitudinal"&&console.error("blur direction must be either latitudinal or longitudinal!");let h=3,u=new we(this._lodPlanes[i],l),d=l.uniforms,p=this._sizeLods[n]-1,g=isFinite(r)?Math.PI/(2*p):2*Math.PI/(2*zs-1),_=r/g,m=isFinite(r)?1+Math.floor(h*_):zs;m>zs&&console.warn(`sigmaRadians, ${r}, is too large and will clip, as it requested ${m} samples when the maximum is set to ${zs}`);let f=[],v=0;for(let w=0;w<zs;++w){let R=w/_,M=Math.exp(-R*R/2);f.push(M),w===0?v+=M:w<m&&(v+=2*M)}for(let w=0;w<f.length;w++)f[w]=f[w]/v;d.envMap.value=e.texture,d.samples.value=m,d.weights.value=f,d.latitudinal.value=o==="latitudinal",a&&(d.poleAxis.value=a);let{_lodMax:S}=this;d.dTheta.value=g,d.mipInt.value=S-n;let x=this._sizeLods[i],P=3*x*(i>S-yr?i-S+yr:0),T=4*(this._cubeSize-x);vc(t,P,T,3*x,2*x),c.setRenderTarget(t),c.render(u,$l)}};function p_(s){let e=[],t=[],n=[],i=s,r=s-yr+1+Gd.length;for(let o=0;o<r;o++){let a=Math.pow(2,i);t.push(a);let c=1/a;o>s-yr?c=Gd[o-s+yr-1]:o===0&&(c=0),n.push(c);let l=1/(a-2),h=-l,u=1+l,d=[h,h,u,h,u,u,h,h,u,u,h,u],p=6,g=6,_=3,m=2,f=1,v=new Float32Array(_*g*p),S=new Float32Array(m*g*p),x=new Float32Array(f*g*p);for(let T=0;T<p;T++){let w=T%3*2/3-1,R=T>2?0:-1,M=[w,R,0,w+2/3,R,0,w+2/3,R+1,0,w,R,0,w+2/3,R+1,0,w,R+1,0];v.set(M,_*g*T),S.set(d,m*g*T);let y=[T,T,T,T,T,T];x.set(y,f*g*T)}let P=new Bt;P.setAttribute("position",new xt(v,_)),P.setAttribute("uv",new xt(S,m)),P.setAttribute("faceIndex",new xt(x,f)),e.push(P),i>yr&&i--}return{lodPlanes:e,sizeLods:t,sigmas:n}}function Xd(s,e,t){let n=new ai(s,e,t);return n.texture.mapping=yo,n.texture.name="PMREM.cubeUv",n.scissorTest=!0,n}function vc(s,e,t,n,i){s.viewport.set(e,t,n,i),s.scissor.set(e,t,n,i)}function m_(s,e,t){let n=new Float32Array(zs),i=new D(0,1,0);return new Jn({name:"SphericalGaussianBlur",defines:{n:zs,CUBEUV_TEXEL_WIDTH:1/e,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${s}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:n},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:i}},vertexShader:uh(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:Ui,depthTest:!1,depthWrite:!1})}function Yd(){return new Jn({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:uh(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:Ui,depthTest:!1,depthWrite:!1})}function qd(){return new Jn({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:uh(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Ui,depthTest:!1,depthWrite:!1})}function uh(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}function g_(s){let e=new WeakMap,t=null;function n(a){if(a&&a.isTexture){let c=a.mapping,l=c===Ls||c===Oa,h=c===Is||c===Ps;if(l||h){let u=e.get(a),d=u!==void 0?u.texture.pmremVersion:0;if(a.isRenderTargetTexture&&a.pmremVersion!==d)return t===null&&(t=new Mr(s)),u=l?t.fromEquirectangular(a,u):t.fromCubemap(a,u),u.texture.pmremVersion=a.pmremVersion,e.set(a,u),u.texture;if(u!==void 0)return u.texture;{let p=a.image;return l&&p&&p.height>0||h&&p&&i(p)?(t===null&&(t=new Mr(s)),u=l?t.fromEquirectangular(a):t.fromCubemap(a),u.texture.pmremVersion=a.pmremVersion,e.set(a,u),a.addEventListener("dispose",r),u.texture):null}}}return a}function i(a){let c=0,l=6;for(let h=0;h<l;h++)a[h]!==void 0&&c++;return c===l}function r(a){let c=a.target;c.removeEventListener("dispose",r);let l=e.get(c);l!==void 0&&(e.delete(c),l.dispose())}function o(){e=new WeakMap,t!==null&&(t.dispose(),t=null)}return{get:n,dispose:o}}function __(s){let e={};function t(n){if(e[n]!==void 0)return e[n];let i;switch(n){case"WEBGL_depth_texture":i=s.getExtension("WEBGL_depth_texture")||s.getExtension("MOZ_WEBGL_depth_texture")||s.getExtension("WEBKIT_WEBGL_depth_texture");break;case"EXT_texture_filter_anisotropic":i=s.getExtension("EXT_texture_filter_anisotropic")||s.getExtension("MOZ_EXT_texture_filter_anisotropic")||s.getExtension("WEBKIT_EXT_texture_filter_anisotropic");break;case"WEBGL_compressed_texture_s3tc":i=s.getExtension("WEBGL_compressed_texture_s3tc")||s.getExtension("MOZ_WEBGL_compressed_texture_s3tc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");break;case"WEBGL_compressed_texture_pvrtc":i=s.getExtension("WEBGL_compressed_texture_pvrtc")||s.getExtension("WEBKIT_WEBGL_compressed_texture_pvrtc");break;default:i=s.getExtension(n)}return e[n]=i,i}return{has:function(n){return t(n)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(n){let i=t(n);return i===null&&ts("THREE.WebGLRenderer: "+n+" extension not supported."),i}}}function x_(s,e,t,n){let i={},r=new WeakMap;function o(u){let d=u.target;d.index!==null&&e.remove(d.index);for(let g in d.attributes)e.remove(d.attributes[g]);d.removeEventListener("dispose",o),delete i[d.id];let p=r.get(d);p&&(e.remove(p),r.delete(d)),n.releaseStatesOfGeometry(d),d.isInstancedBufferGeometry===!0&&delete d._maxInstanceCount,t.memory.geometries--}function a(u,d){return i[d.id]===!0||(d.addEventListener("dispose",o),i[d.id]=!0,t.memory.geometries++),d}function c(u){let d=u.attributes;for(let p in d)e.update(d[p],s.ARRAY_BUFFER)}function l(u){let d=[],p=u.index,g=u.attributes.position,_=0;if(p!==null){let v=p.array;_=p.version;for(let S=0,x=v.length;S<x;S+=3){let P=v[S+0],T=v[S+1],w=v[S+2];d.push(P,T,T,w,w,P)}}else if(g!==void 0){let v=g.array;_=g.version;for(let S=0,x=v.length/3-1;S<x;S+=3){let P=S+0,T=S+1,w=S+2;d.push(P,T,T,w,w,P)}}else return;let m=new(Yl(d)?Jr:Kr)(d,1);m.version=_;let f=r.get(u);f&&e.remove(f),r.set(u,m)}function h(u){let d=r.get(u);if(d){let p=u.index;p!==null&&d.version<p.version&&l(u)}else l(u);return r.get(u)}return{get:a,update:c,getWireframeAttribute:h}}function y_(s,e,t){let n;function i(d){n=d}let r,o;function a(d){r=d.type,o=d.bytesPerElement}function c(d,p){s.drawElements(n,p,r,d*o),t.update(p,n,1)}function l(d,p,g){g!==0&&(s.drawElementsInstanced(n,p,r,d*o,g),t.update(p,n,g))}function h(d,p,g){if(g===0)return;e.get("WEBGL_multi_draw").multiDrawElementsWEBGL(n,p,0,r,d,0,g);let m=0;for(let f=0;f<g;f++)m+=p[f];t.update(m,n,1)}function u(d,p,g,_){if(g===0)return;let m=e.get("WEBGL_multi_draw");if(m===null)for(let f=0;f<d.length;f++)l(d[f]/o,p[f],_[f]);else{m.multiDrawElementsInstancedWEBGL(n,p,0,r,d,0,_,0,g);let f=0;for(let v=0;v<g;v++)f+=p[v]*_[v];t.update(f,n,1)}}this.setMode=i,this.setIndex=a,this.render=c,this.renderInstances=l,this.renderMultiDraw=h,this.renderMultiDrawInstances=u}function v_(s){let e={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function n(r,o,a){switch(t.calls++,o){case s.TRIANGLES:t.triangles+=a*(r/3);break;case s.LINES:t.lines+=a*(r/2);break;case s.LINE_STRIP:t.lines+=a*(r-1);break;case s.LINE_LOOP:t.lines+=a*r;break;case s.POINTS:t.points+=a*r;break;default:console.error("THREE.WebGLInfo: Unknown draw mode:",o);break}}function i(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:e,render:t,programs:null,autoReset:!0,reset:i,update:n}}function M_(s,e,t){let n=new WeakMap,i=new _t;function r(o,a,c){let l=o.morphTargetInfluences,h=a.morphAttributes.position||a.morphAttributes.normal||a.morphAttributes.color,u=h!==void 0?h.length:0,d=n.get(a);if(d===void 0||d.count!==u){let M=function(){w.dispose(),n.delete(a),a.removeEventListener("dispose",M)};d!==void 0&&d.texture.dispose();let p=a.morphAttributes.position!==void 0,g=a.morphAttributes.normal!==void 0,_=a.morphAttributes.color!==void 0,m=a.morphAttributes.position||[],f=a.morphAttributes.normal||[],v=a.morphAttributes.color||[],S=0;p===!0&&(S=1),g===!0&&(S=2),_===!0&&(S=3);let x=a.attributes.position.count*S,P=1;x>e.maxTextureSize&&(P=Math.ceil(x/e.maxTextureSize),x=e.maxTextureSize);let T=new Float32Array(x*P*4*u),w=new qr(T,x,P,u);w.type=gn,w.needsUpdate=!0;let R=S*4;for(let y=0;y<u;y++){let I=m[y],F=f[y],U=v[y],O=x*P*4*y;for(let $=0;$<I.count;$++){let k=$*R;p===!0&&(i.fromBufferAttribute(I,$),T[O+k+0]=i.x,T[O+k+1]=i.y,T[O+k+2]=i.z,T[O+k+3]=0),g===!0&&(i.fromBufferAttribute(F,$),T[O+k+4]=i.x,T[O+k+5]=i.y,T[O+k+6]=i.z,T[O+k+7]=0),_===!0&&(i.fromBufferAttribute(U,$),T[O+k+8]=i.x,T[O+k+9]=i.y,T[O+k+10]=i.z,T[O+k+11]=U.itemSize===4?i.w:1)}}d={count:u,texture:w,size:new ke(x,P)},n.set(a,d),a.addEventListener("dispose",M)}if(o.isInstancedMesh===!0&&o.morphTexture!==null)c.getUniforms().setValue(s,"morphTexture",o.morphTexture,t);else{let p=0;for(let _=0;_<l.length;_++)p+=l[_];let g=a.morphTargetsRelative?1:1-p;c.getUniforms().setValue(s,"morphTargetBaseInfluence",g),c.getUniforms().setValue(s,"morphTargetInfluences",l)}c.getUniforms().setValue(s,"morphTargetsTexture",d.texture,t),c.getUniforms().setValue(s,"morphTargetsTextureSize",d.size)}return{update:r}}function b_(s,e,t,n){let i=new WeakMap;function r(c){let l=n.render.frame,h=c.geometry,u=e.get(c,h);if(i.get(u)!==l&&(e.update(u),i.set(u,l)),c.isInstancedMesh&&(c.hasEventListener("dispose",a)===!1&&c.addEventListener("dispose",a),i.get(c)!==l&&(t.update(c.instanceMatrix,s.ARRAY_BUFFER),c.instanceColor!==null&&t.update(c.instanceColor,s.ARRAY_BUFFER),i.set(c,l))),c.isSkinnedMesh){let d=c.skeleton;i.get(d)!==l&&(d.update(),i.set(d,l))}return u}function o(){i=new WeakMap}function a(c){let l=c.target;l.removeEventListener("dispose",a),t.remove(l.instanceMatrix),l.instanceColor!==null&&t.remove(l.instanceColor)}return{update:r,dispose:o}}var ff=new $t,Zd=new so(1,1),pf=new qr,mf=new ma,gf=new jr,Kd=[],Jd=[],$d=new Float32Array(16),jd=new Float32Array(9),Qd=new Float32Array(4);function br(s,e,t){let n=s[0];if(n<=0||n>0)return s;let i=e*t,r=Kd[i];if(r===void 0&&(r=new Float32Array(i),Kd[i]=r),e!==0){n.toArray(r,0);for(let o=1,a=0;o!==e;++o)a+=t,s[o].toArray(r,a)}return r}function Qt(s,e){if(s.length!==e.length)return!1;for(let t=0,n=s.length;t<n;t++)if(s[t]!==e[t])return!1;return!0}function en(s,e){for(let t=0,n=e.length;t<n;t++)s[t]=e[t]}function Sc(s,e){let t=Jd[e];t===void 0&&(t=new Int32Array(e),Jd[e]=t);for(let n=0;n!==e;++n)t[n]=s.allocateTextureUnit();return t}function S_(s,e){let t=this.cache;t[0]!==e&&(s.uniform1f(this.addr,e),t[0]=e)}function E_(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(s.uniform2f(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Qt(t,e))return;s.uniform2fv(this.addr,e),en(t,e)}}function T_(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(s.uniform3f(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else if(e.r!==void 0)(t[0]!==e.r||t[1]!==e.g||t[2]!==e.b)&&(s.uniform3f(this.addr,e.r,e.g,e.b),t[0]=e.r,t[1]=e.g,t[2]=e.b);else{if(Qt(t,e))return;s.uniform3fv(this.addr,e),en(t,e)}}function A_(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(s.uniform4f(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Qt(t,e))return;s.uniform4fv(this.addr,e),en(t,e)}}function w_(s,e){let t=this.cache,n=e.elements;if(n===void 0){if(Qt(t,e))return;s.uniformMatrix2fv(this.addr,!1,e),en(t,e)}else{if(Qt(t,n))return;Qd.set(n),s.uniformMatrix2fv(this.addr,!1,Qd),en(t,n)}}function R_(s,e){let t=this.cache,n=e.elements;if(n===void 0){if(Qt(t,e))return;s.uniformMatrix3fv(this.addr,!1,e),en(t,e)}else{if(Qt(t,n))return;jd.set(n),s.uniformMatrix3fv(this.addr,!1,jd),en(t,n)}}function C_(s,e){let t=this.cache,n=e.elements;if(n===void 0){if(Qt(t,e))return;s.uniformMatrix4fv(this.addr,!1,e),en(t,e)}else{if(Qt(t,n))return;$d.set(n),s.uniformMatrix4fv(this.addr,!1,$d),en(t,n)}}function I_(s,e){let t=this.cache;t[0]!==e&&(s.uniform1i(this.addr,e),t[0]=e)}function P_(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(s.uniform2i(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Qt(t,e))return;s.uniform2iv(this.addr,e),en(t,e)}}function L_(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(s.uniform3i(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Qt(t,e))return;s.uniform3iv(this.addr,e),en(t,e)}}function D_(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(s.uniform4i(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Qt(t,e))return;s.uniform4iv(this.addr,e),en(t,e)}}function U_(s,e){let t=this.cache;t[0]!==e&&(s.uniform1ui(this.addr,e),t[0]=e)}function N_(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y)&&(s.uniform2ui(this.addr,e.x,e.y),t[0]=e.x,t[1]=e.y);else{if(Qt(t,e))return;s.uniform2uiv(this.addr,e),en(t,e)}}function F_(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z)&&(s.uniform3ui(this.addr,e.x,e.y,e.z),t[0]=e.x,t[1]=e.y,t[2]=e.z);else{if(Qt(t,e))return;s.uniform3uiv(this.addr,e),en(t,e)}}function B_(s,e){let t=this.cache;if(e.x!==void 0)(t[0]!==e.x||t[1]!==e.y||t[2]!==e.z||t[3]!==e.w)&&(s.uniform4ui(this.addr,e.x,e.y,e.z,e.w),t[0]=e.x,t[1]=e.y,t[2]=e.z,t[3]=e.w);else{if(Qt(t,e))return;s.uniform4uiv(this.addr,e),en(t,e)}}function O_(s,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i);let r;this.type===s.SAMPLER_2D_SHADOW?(Zd.compareFunction=Gl,r=Zd):r=ff,t.setTexture2D(e||r,i)}function z_(s,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),t.setTexture3D(e||mf,i)}function H_(s,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),t.setTextureCube(e||gf,i)}function k_(s,e,t){let n=this.cache,i=t.allocateTextureUnit();n[0]!==i&&(s.uniform1i(this.addr,i),n[0]=i),t.setTexture2DArray(e||pf,i)}function G_(s){switch(s){case 5126:return S_;case 35664:return E_;case 35665:return T_;case 35666:return A_;case 35674:return w_;case 35675:return R_;case 35676:return C_;case 5124:case 35670:return I_;case 35667:case 35671:return P_;case 35668:case 35672:return L_;case 35669:case 35673:return D_;case 5125:return U_;case 36294:return N_;case 36295:return F_;case 36296:return B_;case 35678:case 36198:case 36298:case 36306:case 35682:return O_;case 35679:case 36299:case 36307:return z_;case 35680:case 36300:case 36308:case 36293:return H_;case 36289:case 36303:case 36311:case 36292:return k_}}function V_(s,e){s.uniform1fv(this.addr,e)}function W_(s,e){let t=br(e,this.size,2);s.uniform2fv(this.addr,t)}function X_(s,e){let t=br(e,this.size,3);s.uniform3fv(this.addr,t)}function Y_(s,e){let t=br(e,this.size,4);s.uniform4fv(this.addr,t)}function q_(s,e){let t=br(e,this.size,4);s.uniformMatrix2fv(this.addr,!1,t)}function Z_(s,e){let t=br(e,this.size,9);s.uniformMatrix3fv(this.addr,!1,t)}function K_(s,e){let t=br(e,this.size,16);s.uniformMatrix4fv(this.addr,!1,t)}function J_(s,e){s.uniform1iv(this.addr,e)}function $_(s,e){s.uniform2iv(this.addr,e)}function j_(s,e){s.uniform3iv(this.addr,e)}function Q_(s,e){s.uniform4iv(this.addr,e)}function ex(s,e){s.uniform1uiv(this.addr,e)}function tx(s,e){s.uniform2uiv(this.addr,e)}function nx(s,e){s.uniform3uiv(this.addr,e)}function ix(s,e){s.uniform4uiv(this.addr,e)}function sx(s,e,t){let n=this.cache,i=e.length,r=Sc(t,i);Qt(n,r)||(s.uniform1iv(this.addr,r),en(n,r));for(let o=0;o!==i;++o)t.setTexture2D(e[o]||ff,r[o])}function rx(s,e,t){let n=this.cache,i=e.length,r=Sc(t,i);Qt(n,r)||(s.uniform1iv(this.addr,r),en(n,r));for(let o=0;o!==i;++o)t.setTexture3D(e[o]||mf,r[o])}function ox(s,e,t){let n=this.cache,i=e.length,r=Sc(t,i);Qt(n,r)||(s.uniform1iv(this.addr,r),en(n,r));for(let o=0;o!==i;++o)t.setTextureCube(e[o]||gf,r[o])}function ax(s,e,t){let n=this.cache,i=e.length,r=Sc(t,i);Qt(n,r)||(s.uniform1iv(this.addr,r),en(n,r));for(let o=0;o!==i;++o)t.setTexture2DArray(e[o]||pf,r[o])}function cx(s){switch(s){case 5126:return V_;case 35664:return W_;case 35665:return X_;case 35666:return Y_;case 35674:return q_;case 35675:return Z_;case 35676:return K_;case 5124:case 35670:return J_;case 35667:case 35671:return $_;case 35668:case 35672:return j_;case 35669:case 35673:return Q_;case 5125:return ex;case 36294:return tx;case 36295:return nx;case 36296:return ix;case 35678:case 36198:case 36298:case 36306:case 35682:return sx;case 35679:case 36299:case 36307:return rx;case 35680:case 36300:case 36308:case 36293:return ox;case 36289:case 36303:case 36311:case 36292:return ax}}var ih=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.setValue=G_(t.type)}},sh=class{constructor(e,t,n){this.id=e,this.addr=n,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=cx(t.type)}},rh=class{constructor(e){this.id=e,this.seq=[],this.map={}}setValue(e,t,n){let i=this.seq;for(let r=0,o=i.length;r!==o;++r){let a=i[r];a.setValue(e,t[a.id],n)}}},nh=/(\w+)(\])?(\[|\.)?/g;function ef(s,e){s.seq.push(e),s.map[e.id]=e}function lx(s,e,t){let n=s.name,i=n.length;for(nh.lastIndex=0;;){let r=nh.exec(n),o=nh.lastIndex,a=r[1],c=r[2]==="]",l=r[3];if(c&&(a=a|0),l===void 0||l==="["&&o+2===i){ef(t,l===void 0?new ih(a,s,e):new sh(a,s,e));break}else{let u=t.map[a];u===void 0&&(u=new rh(a),ef(t,u)),t=u}}}var vr=class{constructor(e,t){this.seq=[],this.map={};let n=e.getProgramParameter(t,e.ACTIVE_UNIFORMS);for(let i=0;i<n;++i){let r=e.getActiveUniform(t,i),o=e.getUniformLocation(t,r.name);lx(r,o,this)}}setValue(e,t,n,i){let r=this.map[t];r!==void 0&&r.setValue(e,n,i)}setOptional(e,t,n){let i=t[n];i!==void 0&&this.setValue(e,n,i)}static upload(e,t,n,i){for(let r=0,o=t.length;r!==o;++r){let a=t[r],c=n[a.id];c.needsUpdate!==!1&&a.setValue(e,c.value,i)}}static seqWithValue(e,t){let n=[];for(let i=0,r=e.length;i!==r;++i){let o=e[i];o.id in t&&n.push(o)}return n}};function tf(s,e,t){let n=s.createShader(e);return s.shaderSource(n,t),s.compileShader(n),n}var hx=37297,ux=0;function dx(s,e){let t=s.split(`
`),n=[],i=Math.max(e-6,0),r=Math.min(e+6,t.length);for(let o=i;o<r;o++){let a=o+1;n.push(`${a===e?">":" "} ${a}: ${t[o]}`)}return n.join(`
`)}var nf=new Qe;function fx(s){ft._getMatrix(nf,ft.workingColorSpace,s);let e=`mat3( ${nf.elements.map(t=>t.toFixed(4))} )`;switch(ft.getTransfer(s)){case Xr:return[e,"LinearTransferOETF"];case At:return[e,"sRGBTransferOETF"];default:return console.warn("THREE.WebGLProgram: Unsupported color space: ",s),[e,"LinearTransferOETF"]}}function sf(s,e,t){let n=s.getShaderParameter(e,s.COMPILE_STATUS),i=s.getShaderInfoLog(e).trim();if(n&&i==="")return"";let r=/ERROR: 0:(\d+)/.exec(i);if(r){let o=parseInt(r[1]);return t.toUpperCase()+`

`+i+`

`+dx(s.getShaderSource(e),o)}else return i}function px(s,e){let t=fx(e);return[`vec4 ${s}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}function mx(s,e){let t;switch(e){case md:t="Linear";break;case gd:t="Reinhard";break;case _d:t="Cineon";break;case Ba:t="ACESFilmic";break;case yd:t="AgX";break;case vd:t="Neutral";break;case xd:t="Custom";break;default:console.warn("THREE.WebGLProgram: Unsupported toneMapping:",e),t="Linear"}return"vec3 "+s+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}var Mc=new D;function gx(){ft.getLuminanceCoefficients(Mc);let s=Mc.x.toFixed(4),e=Mc.y.toFixed(4),t=Mc.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${s}, ${e}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function _x(s){return[s.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",s.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(Ao).join(`
`)}function xx(s){let e=[];for(let t in s){let n=s[t];n!==!1&&e.push("#define "+t+" "+n)}return e.join(`
`)}function yx(s,e){let t={},n=s.getProgramParameter(e,s.ACTIVE_ATTRIBUTES);for(let i=0;i<n;i++){let r=s.getActiveAttrib(e,i),o=r.name,a=1;r.type===s.FLOAT_MAT2&&(a=2),r.type===s.FLOAT_MAT3&&(a=3),r.type===s.FLOAT_MAT4&&(a=4),t[o]={type:r.type,location:s.getAttribLocation(e,o),locationSize:a}}return t}function Ao(s){return s!==""}function rf(s,e){let t=e.numSpotLightShadows+e.numSpotLightMaps-e.numSpotLightShadowsWithMaps;return s.replace(/NUM_DIR_LIGHTS/g,e.numDirLights).replace(/NUM_SPOT_LIGHTS/g,e.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,e.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,e.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,e.numPointLights).replace(/NUM_HEMI_LIGHTS/g,e.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,e.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,e.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,e.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,e.numPointLightShadows)}function of(s,e){return s.replace(/NUM_CLIPPING_PLANES/g,e.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,e.numClippingPlanes-e.numClipIntersection)}var vx=/^[ \t]*#include +<([\w\d./]+)>/gm;function oh(s){return s.replace(vx,bx)}var Mx=new Map;function bx(s,e){let t=lt[e];if(t===void 0){let n=Mx.get(e);if(n!==void 0)t=lt[n],console.warn('THREE.WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',e,n);else throw new Error("Can not resolve #include <"+e+">")}return oh(t)}var Sx=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function af(s){return s.replace(Sx,Ex)}function Ex(s,e,t,n){let i="";for(let r=parseInt(e);r<parseInt(t);r++)i+=n.replace(/\[\s*i\s*\]/g,"[ "+r+" ]").replace(/UNROLLED_LOOP_INDEX/g,r);return i}function cf(s){let e=`precision ${s.precision} float;
	precision ${s.precision} int;
	precision ${s.precision} sampler2D;
	precision ${s.precision} samplerCube;
	precision ${s.precision} sampler3D;
	precision ${s.precision} sampler2DArray;
	precision ${s.precision} sampler2DShadow;
	precision ${s.precision} samplerCubeShadow;
	precision ${s.precision} sampler2DArrayShadow;
	precision ${s.precision} isampler2D;
	precision ${s.precision} isampler3D;
	precision ${s.precision} isamplerCube;
	precision ${s.precision} isampler2DArray;
	precision ${s.precision} usampler2D;
	precision ${s.precision} usampler3D;
	precision ${s.precision} usamplerCube;
	precision ${s.precision} usampler2DArray;
	`;return s.precision==="highp"?e+=`
#define HIGH_PRECISION`:s.precision==="mediump"?e+=`
#define MEDIUM_PRECISION`:s.precision==="lowp"&&(e+=`
#define LOW_PRECISION`),e}function Tx(s){let e="SHADOWMAP_TYPE_BASIC";return s.shadowMapType===Al?e="SHADOWMAP_TYPE_PCF":s.shadowMapType===Ca?e="SHADOWMAP_TYPE_PCF_SOFT":s.shadowMapType===di&&(e="SHADOWMAP_TYPE_VSM"),e}function Ax(s){let e="ENVMAP_TYPE_CUBE";if(s.envMap)switch(s.envMapMode){case Is:case Ps:e="ENVMAP_TYPE_CUBE";break;case yo:e="ENVMAP_TYPE_CUBE_UV";break}return e}function wx(s){let e="ENVMAP_MODE_REFLECTION";return s.envMap&&s.envMapMode===Ps&&(e="ENVMAP_MODE_REFRACTION"),e}function Rx(s){let e="ENVMAP_BLENDING_NONE";if(s.envMap)switch(s.combine){case Cl:e="ENVMAP_BLENDING_MULTIPLY";break;case fd:e="ENVMAP_BLENDING_MIX";break;case pd:e="ENVMAP_BLENDING_ADD";break}return e}function Cx(s){let e=s.envMapCubeUVHeight;if(e===null)return null;let t=Math.log2(e)-2,n=1/e;return{texelWidth:1/(3*Math.max(Math.pow(2,t),112)),texelHeight:n,maxMip:t}}function Ix(s,e,t,n){let i=s.getContext(),r=t.defines,o=t.vertexShader,a=t.fragmentShader,c=Tx(t),l=Ax(t),h=wx(t),u=Rx(t),d=Cx(t),p=_x(t),g=xx(r),_=i.createProgram(),m,f,v=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(m=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g].filter(Ao).join(`
`),m.length>0&&(m+=`
`),f=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g].filter(Ao).join(`
`),f.length>0&&(f+=`
`)):(m=[cf(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+h:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+c:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",t.reverseDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(Ao).join(`
`),f=[cf(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,g,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+l:"",t.envMap?"#define "+h:"",t.envMap?"#define "+u:"",d?"#define CUBEUV_TEXEL_WIDTH "+d.texelWidth:"",d?"#define CUBEUV_TEXEL_HEIGHT "+d.texelHeight:"",d?"#define CUBEUV_MAX_MIP "+d.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor||t.batchingColor?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+c:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGDEPTHBUF":"",t.reverseDepthBuffer?"#define USE_REVERSEDEPTHBUF":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==Ni?"#define TONE_MAPPING":"",t.toneMapping!==Ni?lt.tonemapping_pars_fragment:"",t.toneMapping!==Ni?mx("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",lt.colorspace_pars_fragment,px("linearToOutputTexel",t.outputColorSpace),gx(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(Ao).join(`
`)),o=oh(o),o=rf(o,t),o=of(o,t),a=oh(a),a=rf(a,t),a=of(a,t),o=af(o),a=af(a),t.isRawShaderMaterial!==!0&&(v=`#version 300 es
`,m=[p,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+m,f=["#define varying in",t.glslVersion===Vl?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===Vl?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+f);let S=v+m+o,x=v+f+a,P=tf(i,i.VERTEX_SHADER,S),T=tf(i,i.FRAGMENT_SHADER,x);i.attachShader(_,P),i.attachShader(_,T),t.index0AttributeName!==void 0?i.bindAttribLocation(_,0,t.index0AttributeName):t.morphTargets===!0&&i.bindAttribLocation(_,0,"position"),i.linkProgram(_);function w(I){if(s.debug.checkShaderErrors){let F=i.getProgramInfoLog(_).trim(),U=i.getShaderInfoLog(P).trim(),O=i.getShaderInfoLog(T).trim(),$=!0,k=!0;if(i.getProgramParameter(_,i.LINK_STATUS)===!1)if($=!1,typeof s.debug.onShaderError=="function")s.debug.onShaderError(i,_,P,T);else{let ee=sf(i,P,"vertex"),Y=sf(i,T,"fragment");console.error("THREE.WebGLProgram: Shader Error "+i.getError()+" - VALIDATE_STATUS "+i.getProgramParameter(_,i.VALIDATE_STATUS)+`

Material Name: `+I.name+`
Material Type: `+I.type+`

Program Info Log: `+F+`
`+ee+`
`+Y)}else F!==""?console.warn("THREE.WebGLProgram: Program Info Log:",F):(U===""||O==="")&&(k=!1);k&&(I.diagnostics={runnable:$,programLog:F,vertexShader:{log:U,prefix:m},fragmentShader:{log:O,prefix:f}})}i.deleteShader(P),i.deleteShader(T),R=new vr(i,_),M=yx(i,_)}let R;this.getUniforms=function(){return R===void 0&&w(this),R};let M;this.getAttributes=function(){return M===void 0&&w(this),M};let y=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return y===!1&&(y=i.getProgramParameter(_,hx)),y},this.destroy=function(){n.releaseStatesOfProgram(this),i.deleteProgram(_),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=ux++,this.cacheKey=e,this.usedTimes=1,this.program=_,this.vertexShader=P,this.fragmentShader=T,this}var Px=0,ah=class{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(e){let t=e.vertexShader,n=e.fragmentShader,i=this._getShaderStage(t),r=this._getShaderStage(n),o=this._getShaderCacheForMaterial(e);return o.has(i)===!1&&(o.add(i),i.usedTimes++),o.has(r)===!1&&(o.add(r),r.usedTimes++),this}remove(e){let t=this.materialCache.get(e);for(let n of t)n.usedTimes--,n.usedTimes===0&&this.shaderCache.delete(n.code);return this.materialCache.delete(e),this}getVertexShaderID(e){return this._getShaderStage(e.vertexShader).id}getFragmentShaderID(e){return this._getShaderStage(e.fragmentShader).id}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(e){let t=this.materialCache,n=t.get(e);return n===void 0&&(n=new Set,t.set(e,n)),n}_getShaderStage(e){let t=this.shaderCache,n=t.get(e);return n===void 0&&(n=new ch(e),t.set(e,n)),n}},ch=class{constructor(e){this.id=Px++,this.code=e,this.usedTimes=0}};function Lx(s,e,t,n,i,r,o){let a=new Zr,c=new ah,l=new Set,h=[],u=i.logarithmicDepthBuffer,d=i.vertexTextures,p=i.precision,g={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distanceRGBA",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function _(M){return l.add(M),M===0?"uv":`uv${M}`}function m(M,y,I,F,U){let O=F.fog,$=U.geometry,k=M.isMeshStandardMaterial?F.environment:null,ee=(M.isMeshStandardMaterial?t:e).get(M.envMap||k),Y=ee&&ee.mapping===yo?ee.image.height:null,ce=g[M.type];M.precision!==null&&(p=i.getMaxPrecision(M.precision),p!==M.precision&&console.warn("THREE.WebGLProgram.getParameters:",M.precision,"not supported, using",p,"instead."));let pe=$.morphAttributes.position||$.morphAttributes.normal||$.morphAttributes.color,Ie=pe!==void 0?pe.length:0,Ue=0;$.morphAttributes.position!==void 0&&(Ue=1),$.morphAttributes.normal!==void 0&&(Ue=2),$.morphAttributes.color!==void 0&&(Ue=3);let Ge,te,ue,Ae;if(ce){let nt=pi[ce];Ge=nt.vertexShader,te=nt.fragmentShader}else Ge=M.vertexShader,te=M.fragmentShader,c.update(M),ue=c.getVertexShaderID(M),Ae=c.getFragmentShaderID(M);let ye=s.getRenderTarget(),Be=s.state.buffers.depth.getReversed(),qe=U.isInstancedMesh===!0,Fe=U.isBatchedMesh===!0,Ne=!!M.map,et=!!M.matcap,Ke=!!ee,L=!!M.aoMap,on=!!M.lightMap,rt=!!M.bumpMap,ot=!!M.normalMap,ve=!!M.displacementMap,gt=!!M.emissiveMap,Ce=!!M.metalnessMap,A=!!M.roughnessMap,b=M.anisotropy>0,W=M.clearcoat>0,ie=M.dispersion>0,ne=M.iridescence>0,Z=M.sheen>0,xe=M.transmission>0,_e=b&&!!M.anisotropyMap,be=W&&!!M.clearcoatMap,We=W&&!!M.clearcoatNormalMap,le=W&&!!M.clearcoatRoughnessMap,Ee=ne&&!!M.iridescenceMap,Pe=ne&&!!M.iridescenceThicknessMap,Oe=Z&&!!M.sheenColorMap,Se=Z&&!!M.sheenRoughnessMap,tt=!!M.specularMap,ze=!!M.specularColorMap,mt=!!M.specularIntensityMap,N=xe&&!!M.transmissionMap,de=xe&&!!M.thicknessMap,j=!!M.gradientMap,se=!!M.alphaMap,fe=M.alphaTest>0,me=!!M.alphaHash,He=!!M.extensions,Et=Ni;M.toneMapped&&(ye===null||ye.isXRRenderTarget===!0)&&(Et=s.toneMapping);let Ct={shaderID:ce,shaderType:M.type,shaderName:M.name,vertexShader:Ge,fragmentShader:te,defines:M.defines,customVertexShaderID:ue,customFragmentShaderID:Ae,isRawShaderMaterial:M.isRawShaderMaterial===!0,glslVersion:M.glslVersion,precision:p,batching:Fe,batchingColor:Fe&&U._colorsTexture!==null,instancing:qe,instancingColor:qe&&U.instanceColor!==null,instancingMorph:qe&&U.morphTexture!==null,supportsVertexTextures:d,outputColorSpace:ye===null?s.outputColorSpace:ye.isXRRenderTarget===!0?ye.texture.colorSpace:Jt,alphaToCoverage:!!M.alphaToCoverage,map:Ne,matcap:et,envMap:Ke,envMapMode:Ke&&ee.mapping,envMapCubeUVHeight:Y,aoMap:L,lightMap:on,bumpMap:rt,normalMap:ot,displacementMap:d&&ve,emissiveMap:gt,normalMapObjectSpace:ot&&M.normalMapType===Td,normalMapTangentSpace:ot&&M.normalMapType===kl,metalnessMap:Ce,roughnessMap:A,anisotropy:b,anisotropyMap:_e,clearcoat:W,clearcoatMap:be,clearcoatNormalMap:We,clearcoatRoughnessMap:le,dispersion:ie,iridescence:ne,iridescenceMap:Ee,iridescenceThicknessMap:Pe,sheen:Z,sheenColorMap:Oe,sheenRoughnessMap:Se,specularMap:tt,specularColorMap:ze,specularIntensityMap:mt,transmission:xe,transmissionMap:N,thicknessMap:de,gradientMap:j,opaque:M.transparent===!1&&M.blending===ds&&M.alphaToCoverage===!1,alphaMap:se,alphaTest:fe,alphaHash:me,combine:M.combine,mapUv:Ne&&_(M.map.channel),aoMapUv:L&&_(M.aoMap.channel),lightMapUv:on&&_(M.lightMap.channel),bumpMapUv:rt&&_(M.bumpMap.channel),normalMapUv:ot&&_(M.normalMap.channel),displacementMapUv:ve&&_(M.displacementMap.channel),emissiveMapUv:gt&&_(M.emissiveMap.channel),metalnessMapUv:Ce&&_(M.metalnessMap.channel),roughnessMapUv:A&&_(M.roughnessMap.channel),anisotropyMapUv:_e&&_(M.anisotropyMap.channel),clearcoatMapUv:be&&_(M.clearcoatMap.channel),clearcoatNormalMapUv:We&&_(M.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:le&&_(M.clearcoatRoughnessMap.channel),iridescenceMapUv:Ee&&_(M.iridescenceMap.channel),iridescenceThicknessMapUv:Pe&&_(M.iridescenceThicknessMap.channel),sheenColorMapUv:Oe&&_(M.sheenColorMap.channel),sheenRoughnessMapUv:Se&&_(M.sheenRoughnessMap.channel),specularMapUv:tt&&_(M.specularMap.channel),specularColorMapUv:ze&&_(M.specularColorMap.channel),specularIntensityMapUv:mt&&_(M.specularIntensityMap.channel),transmissionMapUv:N&&_(M.transmissionMap.channel),thicknessMapUv:de&&_(M.thicknessMap.channel),alphaMapUv:se&&_(M.alphaMap.channel),vertexTangents:!!$.attributes.tangent&&(ot||b),vertexColors:M.vertexColors,vertexAlphas:M.vertexColors===!0&&!!$.attributes.color&&$.attributes.color.itemSize===4,pointsUvs:U.isPoints===!0&&!!$.attributes.uv&&(Ne||se),fog:!!O,useFog:M.fog===!0,fogExp2:!!O&&O.isFogExp2,flatShading:M.flatShading===!0,sizeAttenuation:M.sizeAttenuation===!0,logarithmicDepthBuffer:u,reverseDepthBuffer:Be,skinning:U.isSkinnedMesh===!0,morphTargets:$.morphAttributes.position!==void 0,morphNormals:$.morphAttributes.normal!==void 0,morphColors:$.morphAttributes.color!==void 0,morphTargetsCount:Ie,morphTextureStride:Ue,numDirLights:y.directional.length,numPointLights:y.point.length,numSpotLights:y.spot.length,numSpotLightMaps:y.spotLightMap.length,numRectAreaLights:y.rectArea.length,numHemiLights:y.hemi.length,numDirLightShadows:y.directionalShadowMap.length,numPointLightShadows:y.pointShadowMap.length,numSpotLightShadows:y.spotShadowMap.length,numSpotLightShadowsWithMaps:y.numSpotLightShadowsWithMaps,numLightProbes:y.numLightProbes,numClippingPlanes:o.numPlanes,numClipIntersection:o.numIntersection,dithering:M.dithering,shadowMapEnabled:s.shadowMap.enabled&&I.length>0,shadowMapType:s.shadowMap.type,toneMapping:Et,decodeVideoTexture:Ne&&M.map.isVideoTexture===!0&&ft.getTransfer(M.map.colorSpace)===At,decodeVideoTextureEmissive:gt&&M.emissiveMap.isVideoTexture===!0&&ft.getTransfer(M.emissiveMap.colorSpace)===At,premultipliedAlpha:M.premultipliedAlpha,doubleSided:M.side===kt,flipSided:M.side===Vt,useDepthPacking:M.depthPacking>=0,depthPacking:M.depthPacking||0,index0AttributeName:M.index0AttributeName,extensionClipCullDistance:He&&M.extensions.clipCullDistance===!0&&n.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(He&&M.extensions.multiDraw===!0||Fe)&&n.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:n.has("KHR_parallel_shader_compile"),customProgramCacheKey:M.customProgramCacheKey()};return Ct.vertexUv1s=l.has(1),Ct.vertexUv2s=l.has(2),Ct.vertexUv3s=l.has(3),l.clear(),Ct}function f(M){let y=[];if(M.shaderID?y.push(M.shaderID):(y.push(M.customVertexShaderID),y.push(M.customFragmentShaderID)),M.defines!==void 0)for(let I in M.defines)y.push(I),y.push(M.defines[I]);return M.isRawShaderMaterial===!1&&(v(y,M),S(y,M),y.push(s.outputColorSpace)),y.push(M.customProgramCacheKey),y.join()}function v(M,y){M.push(y.precision),M.push(y.outputColorSpace),M.push(y.envMapMode),M.push(y.envMapCubeUVHeight),M.push(y.mapUv),M.push(y.alphaMapUv),M.push(y.lightMapUv),M.push(y.aoMapUv),M.push(y.bumpMapUv),M.push(y.normalMapUv),M.push(y.displacementMapUv),M.push(y.emissiveMapUv),M.push(y.metalnessMapUv),M.push(y.roughnessMapUv),M.push(y.anisotropyMapUv),M.push(y.clearcoatMapUv),M.push(y.clearcoatNormalMapUv),M.push(y.clearcoatRoughnessMapUv),M.push(y.iridescenceMapUv),M.push(y.iridescenceThicknessMapUv),M.push(y.sheenColorMapUv),M.push(y.sheenRoughnessMapUv),M.push(y.specularMapUv),M.push(y.specularColorMapUv),M.push(y.specularIntensityMapUv),M.push(y.transmissionMapUv),M.push(y.thicknessMapUv),M.push(y.combine),M.push(y.fogExp2),M.push(y.sizeAttenuation),M.push(y.morphTargetsCount),M.push(y.morphAttributeCount),M.push(y.numDirLights),M.push(y.numPointLights),M.push(y.numSpotLights),M.push(y.numSpotLightMaps),M.push(y.numHemiLights),M.push(y.numRectAreaLights),M.push(y.numDirLightShadows),M.push(y.numPointLightShadows),M.push(y.numSpotLightShadows),M.push(y.numSpotLightShadowsWithMaps),M.push(y.numLightProbes),M.push(y.shadowMapType),M.push(y.toneMapping),M.push(y.numClippingPlanes),M.push(y.numClipIntersection),M.push(y.depthPacking)}function S(M,y){a.disableAll(),y.supportsVertexTextures&&a.enable(0),y.instancing&&a.enable(1),y.instancingColor&&a.enable(2),y.instancingMorph&&a.enable(3),y.matcap&&a.enable(4),y.envMap&&a.enable(5),y.normalMapObjectSpace&&a.enable(6),y.normalMapTangentSpace&&a.enable(7),y.clearcoat&&a.enable(8),y.iridescence&&a.enable(9),y.alphaTest&&a.enable(10),y.vertexColors&&a.enable(11),y.vertexAlphas&&a.enable(12),y.vertexUv1s&&a.enable(13),y.vertexUv2s&&a.enable(14),y.vertexUv3s&&a.enable(15),y.vertexTangents&&a.enable(16),y.anisotropy&&a.enable(17),y.alphaHash&&a.enable(18),y.batching&&a.enable(19),y.dispersion&&a.enable(20),y.batchingColor&&a.enable(21),M.push(a.mask),a.disableAll(),y.fog&&a.enable(0),y.useFog&&a.enable(1),y.flatShading&&a.enable(2),y.logarithmicDepthBuffer&&a.enable(3),y.reverseDepthBuffer&&a.enable(4),y.skinning&&a.enable(5),y.morphTargets&&a.enable(6),y.morphNormals&&a.enable(7),y.morphColors&&a.enable(8),y.premultipliedAlpha&&a.enable(9),y.shadowMapEnabled&&a.enable(10),y.doubleSided&&a.enable(11),y.flipSided&&a.enable(12),y.useDepthPacking&&a.enable(13),y.dithering&&a.enable(14),y.transmission&&a.enable(15),y.sheen&&a.enable(16),y.opaque&&a.enable(17),y.pointsUvs&&a.enable(18),y.decodeVideoTexture&&a.enable(19),y.decodeVideoTextureEmissive&&a.enable(20),y.alphaToCoverage&&a.enable(21),M.push(a.mask)}function x(M){let y=g[M.type],I;if(y){let F=pi[y];I=Od.clone(F.uniforms)}else I=M.uniforms;return I}function P(M,y){let I;for(let F=0,U=h.length;F<U;F++){let O=h[F];if(O.cacheKey===y){I=O,++I.usedTimes;break}}return I===void 0&&(I=new Ix(s,y,M,r),h.push(I)),I}function T(M){if(--M.usedTimes===0){let y=h.indexOf(M);h[y]=h[h.length-1],h.pop(),M.destroy()}}function w(M){c.remove(M)}function R(){c.dispose()}return{getParameters:m,getProgramCacheKey:f,getUniforms:x,acquireProgram:P,releaseProgram:T,releaseShaderCache:w,programs:h,dispose:R}}function Dx(){let s=new WeakMap;function e(o){return s.has(o)}function t(o){let a=s.get(o);return a===void 0&&(a={},s.set(o,a)),a}function n(o){s.delete(o)}function i(o,a,c){s.get(o)[a]=c}function r(){s=new WeakMap}return{has:e,get:t,remove:n,update:i,dispose:r}}function Ux(s,e){return s.groupOrder!==e.groupOrder?s.groupOrder-e.groupOrder:s.renderOrder!==e.renderOrder?s.renderOrder-e.renderOrder:s.material.id!==e.material.id?s.material.id-e.material.id:s.z!==e.z?s.z-e.z:s.id-e.id}function lf(s,e){return s.groupOrder!==e.groupOrder?s.groupOrder-e.groupOrder:s.renderOrder!==e.renderOrder?s.renderOrder-e.renderOrder:s.z!==e.z?e.z-s.z:s.id-e.id}function hf(){let s=[],e=0,t=[],n=[],i=[];function r(){e=0,t.length=0,n.length=0,i.length=0}function o(u,d,p,g,_,m){let f=s[e];return f===void 0?(f={id:u.id,object:u,geometry:d,material:p,groupOrder:g,renderOrder:u.renderOrder,z:_,group:m},s[e]=f):(f.id=u.id,f.object=u,f.geometry=d,f.material=p,f.groupOrder=g,f.renderOrder=u.renderOrder,f.z=_,f.group=m),e++,f}function a(u,d,p,g,_,m){let f=o(u,d,p,g,_,m);p.transmission>0?n.push(f):p.transparent===!0?i.push(f):t.push(f)}function c(u,d,p,g,_,m){let f=o(u,d,p,g,_,m);p.transmission>0?n.unshift(f):p.transparent===!0?i.unshift(f):t.unshift(f)}function l(u,d){t.length>1&&t.sort(u||Ux),n.length>1&&n.sort(d||lf),i.length>1&&i.sort(d||lf)}function h(){for(let u=e,d=s.length;u<d;u++){let p=s[u];if(p.id===null)break;p.id=null,p.object=null,p.geometry=null,p.material=null,p.group=null}}return{opaque:t,transmissive:n,transparent:i,init:r,push:a,unshift:c,finish:h,sort:l}}function Nx(){let s=new WeakMap;function e(n,i){let r=s.get(n),o;return r===void 0?(o=new hf,s.set(n,[o])):i>=r.length?(o=new hf,r.push(o)):o=r[i],o}function t(){s=new WeakMap}return{get:e,dispose:t}}function Fx(){let s={};return{get:function(e){if(s[e.id]!==void 0)return s[e.id];let t;switch(e.type){case"DirectionalLight":t={direction:new D,color:new ge};break;case"SpotLight":t={position:new D,direction:new D,color:new ge,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new D,color:new ge,distance:0,decay:0};break;case"HemisphereLight":t={direction:new D,skyColor:new ge,groundColor:new ge};break;case"RectAreaLight":t={color:new ge,position:new D,halfWidth:new D,halfHeight:new D};break}return s[e.id]=t,t}}}function Bx(){let s={};return{get:function(e){if(s[e.id]!==void 0)return s[e.id];let t;switch(e.type){case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ke};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ke};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new ke,shadowCameraNear:1,shadowCameraFar:1e3};break}return s[e.id]=t,t}}}var Ox=0;function zx(s,e){return(e.castShadow?2:0)-(s.castShadow?2:0)+(e.map?1:0)-(s.map?1:0)}function Hx(s){let e=new Fx,t=Bx(),n={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let l=0;l<9;l++)n.probe.push(new D);let i=new D,r=new Ze,o=new Ze;function a(l){let h=0,u=0,d=0;for(let M=0;M<9;M++)n.probe[M].set(0,0,0);let p=0,g=0,_=0,m=0,f=0,v=0,S=0,x=0,P=0,T=0,w=0;l.sort(zx);for(let M=0,y=l.length;M<y;M++){let I=l[M],F=I.color,U=I.intensity,O=I.distance,$=I.shadow&&I.shadow.map?I.shadow.map.texture:null;if(I.isAmbientLight)h+=F.r*U,u+=F.g*U,d+=F.b*U;else if(I.isLightProbe){for(let k=0;k<9;k++)n.probe[k].addScaledVector(I.sh.coefficients[k],U);w++}else if(I.isDirectionalLight){let k=e.get(I);if(k.color.copy(I.color).multiplyScalar(I.intensity),I.castShadow){let ee=I.shadow,Y=t.get(I);Y.shadowIntensity=ee.intensity,Y.shadowBias=ee.bias,Y.shadowNormalBias=ee.normalBias,Y.shadowRadius=ee.radius,Y.shadowMapSize=ee.mapSize,n.directionalShadow[p]=Y,n.directionalShadowMap[p]=$,n.directionalShadowMatrix[p]=I.shadow.matrix,v++}n.directional[p]=k,p++}else if(I.isSpotLight){let k=e.get(I);k.position.setFromMatrixPosition(I.matrixWorld),k.color.copy(F).multiplyScalar(U),k.distance=O,k.coneCos=Math.cos(I.angle),k.penumbraCos=Math.cos(I.angle*(1-I.penumbra)),k.decay=I.decay,n.spot[_]=k;let ee=I.shadow;if(I.map&&(n.spotLightMap[P]=I.map,P++,ee.updateMatrices(I),I.castShadow&&T++),n.spotLightMatrix[_]=ee.matrix,I.castShadow){let Y=t.get(I);Y.shadowIntensity=ee.intensity,Y.shadowBias=ee.bias,Y.shadowNormalBias=ee.normalBias,Y.shadowRadius=ee.radius,Y.shadowMapSize=ee.mapSize,n.spotShadow[_]=Y,n.spotShadowMap[_]=$,x++}_++}else if(I.isRectAreaLight){let k=e.get(I);k.color.copy(F).multiplyScalar(U),k.halfWidth.set(I.width*.5,0,0),k.halfHeight.set(0,I.height*.5,0),n.rectArea[m]=k,m++}else if(I.isPointLight){let k=e.get(I);if(k.color.copy(I.color).multiplyScalar(I.intensity),k.distance=I.distance,k.decay=I.decay,I.castShadow){let ee=I.shadow,Y=t.get(I);Y.shadowIntensity=ee.intensity,Y.shadowBias=ee.bias,Y.shadowNormalBias=ee.normalBias,Y.shadowRadius=ee.radius,Y.shadowMapSize=ee.mapSize,Y.shadowCameraNear=ee.camera.near,Y.shadowCameraFar=ee.camera.far,n.pointShadow[g]=Y,n.pointShadowMap[g]=$,n.pointShadowMatrix[g]=I.shadow.matrix,S++}n.point[g]=k,g++}else if(I.isHemisphereLight){let k=e.get(I);k.skyColor.copy(I.color).multiplyScalar(U),k.groundColor.copy(I.groundColor).multiplyScalar(U),n.hemi[f]=k,f++}}m>0&&(s.has("OES_texture_float_linear")===!0?(n.rectAreaLTC1=Me.LTC_FLOAT_1,n.rectAreaLTC2=Me.LTC_FLOAT_2):(n.rectAreaLTC1=Me.LTC_HALF_1,n.rectAreaLTC2=Me.LTC_HALF_2)),n.ambient[0]=h,n.ambient[1]=u,n.ambient[2]=d;let R=n.hash;(R.directionalLength!==p||R.pointLength!==g||R.spotLength!==_||R.rectAreaLength!==m||R.hemiLength!==f||R.numDirectionalShadows!==v||R.numPointShadows!==S||R.numSpotShadows!==x||R.numSpotMaps!==P||R.numLightProbes!==w)&&(n.directional.length=p,n.spot.length=_,n.rectArea.length=m,n.point.length=g,n.hemi.length=f,n.directionalShadow.length=v,n.directionalShadowMap.length=v,n.pointShadow.length=S,n.pointShadowMap.length=S,n.spotShadow.length=x,n.spotShadowMap.length=x,n.directionalShadowMatrix.length=v,n.pointShadowMatrix.length=S,n.spotLightMatrix.length=x+P-T,n.spotLightMap.length=P,n.numSpotLightShadowsWithMaps=T,n.numLightProbes=w,R.directionalLength=p,R.pointLength=g,R.spotLength=_,R.rectAreaLength=m,R.hemiLength=f,R.numDirectionalShadows=v,R.numPointShadows=S,R.numSpotShadows=x,R.numSpotMaps=P,R.numLightProbes=w,n.version=Ox++)}function c(l,h){let u=0,d=0,p=0,g=0,_=0,m=h.matrixWorldInverse;for(let f=0,v=l.length;f<v;f++){let S=l[f];if(S.isDirectionalLight){let x=n.directional[u];x.direction.setFromMatrixPosition(S.matrixWorld),i.setFromMatrixPosition(S.target.matrixWorld),x.direction.sub(i),x.direction.transformDirection(m),u++}else if(S.isSpotLight){let x=n.spot[p];x.position.setFromMatrixPosition(S.matrixWorld),x.position.applyMatrix4(m),x.direction.setFromMatrixPosition(S.matrixWorld),i.setFromMatrixPosition(S.target.matrixWorld),x.direction.sub(i),x.direction.transformDirection(m),p++}else if(S.isRectAreaLight){let x=n.rectArea[g];x.position.setFromMatrixPosition(S.matrixWorld),x.position.applyMatrix4(m),o.identity(),r.copy(S.matrixWorld),r.premultiply(m),o.extractRotation(r),x.halfWidth.set(S.width*.5,0,0),x.halfHeight.set(0,S.height*.5,0),x.halfWidth.applyMatrix4(o),x.halfHeight.applyMatrix4(o),g++}else if(S.isPointLight){let x=n.point[d];x.position.setFromMatrixPosition(S.matrixWorld),x.position.applyMatrix4(m),d++}else if(S.isHemisphereLight){let x=n.hemi[_];x.direction.setFromMatrixPosition(S.matrixWorld),x.direction.transformDirection(m),_++}}}return{setup:a,setupView:c,state:n}}function uf(s){let e=new Hx(s),t=[],n=[];function i(h){l.camera=h,t.length=0,n.length=0}function r(h){t.push(h)}function o(h){n.push(h)}function a(){e.setup(t)}function c(h){e.setupView(t,h)}let l={lightsArray:t,shadowsArray:n,camera:null,lights:e,transmissionRenderTarget:{}};return{init:i,state:l,setupLights:a,setupLightsView:c,pushLight:r,pushShadow:o}}function kx(s){let e=new WeakMap;function t(i,r=0){let o=e.get(i),a;return o===void 0?(a=new uf(s),e.set(i,[a])):r>=o.length?(a=new uf(s),o.push(a)):a=o[r],a}function n(){e=new WeakMap}return{get:t,dispose:n}}var Gx=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,Vx=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
#include <packing>
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = unpackRGBATo2Half( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ) );
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = unpackRGBAToDepth( texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ) );
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( squared_mean - mean * mean );
	gl_FragColor = pack2HalfToRGBA( vec2( mean, std_dev ) );
}`;function Wx(s,e,t){let n=new fr,i=new ke,r=new ke,o=new _t,a=new va({depthPacking:Ed}),c=new Ma,l={},h=t.maxTextureSize,u={[Zn]:Vt,[Vt]:Zn,[kt]:kt},d=new Jn({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new ke},radius:{value:4}},vertexShader:Gx,fragmentShader:Vx}),p=d.clone();p.defines.HORIZONTAL_PASS=1;let g=new Bt;g.setAttribute("position",new xt(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));let _=new we(g,d),m=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=Al;let f=this.type;this.render=function(T,w,R){if(m.enabled===!1||m.autoUpdate===!1&&m.needsUpdate===!1||T.length===0)return;let M=s.getRenderTarget(),y=s.getActiveCubeFace(),I=s.getActiveMipmapLevel(),F=s.state;F.setBlending(Ui),F.buffers.color.setClear(1,1,1,1),F.buffers.depth.setTest(!0),F.setScissorTest(!1);let U=f!==di&&this.type===di,O=f===di&&this.type!==di;for(let $=0,k=T.length;$<k;$++){let ee=T[$],Y=ee.shadow;if(Y===void 0){console.warn("THREE.WebGLShadowMap:",ee,"has no shadow.");continue}if(Y.autoUpdate===!1&&Y.needsUpdate===!1)continue;i.copy(Y.mapSize);let ce=Y.getFrameExtents();if(i.multiply(ce),r.copy(Y.mapSize),(i.x>h||i.y>h)&&(i.x>h&&(r.x=Math.floor(h/ce.x),i.x=r.x*ce.x,Y.mapSize.x=r.x),i.y>h&&(r.y=Math.floor(h/ce.y),i.y=r.y*ce.y,Y.mapSize.y=r.y)),Y.map===null||U===!0||O===!0){let Ie=this.type!==di?{minFilter:ln,magFilter:ln}:{};Y.map!==null&&Y.map.dispose(),Y.map=new ai(i.x,i.y,Ie),Y.map.texture.name=ee.name+".shadowMap",Y.camera.updateProjectionMatrix()}s.setRenderTarget(Y.map),s.clear();let pe=Y.getViewportCount();for(let Ie=0;Ie<pe;Ie++){let Ue=Y.getViewport(Ie);o.set(r.x*Ue.x,r.y*Ue.y,r.x*Ue.z,r.y*Ue.w),F.viewport(o),Y.updateMatrices(ee,Ie),n=Y.getFrustum(),x(w,R,Y.camera,ee,this.type)}Y.isPointLightShadow!==!0&&this.type===di&&v(Y,R),Y.needsUpdate=!1}f=this.type,m.needsUpdate=!1,s.setRenderTarget(M,y,I)};function v(T,w){let R=e.update(_);d.defines.VSM_SAMPLES!==T.blurSamples&&(d.defines.VSM_SAMPLES=T.blurSamples,p.defines.VSM_SAMPLES=T.blurSamples,d.needsUpdate=!0,p.needsUpdate=!0),T.mapPass===null&&(T.mapPass=new ai(i.x,i.y)),d.uniforms.shadow_pass.value=T.map.texture,d.uniforms.resolution.value=T.mapSize,d.uniforms.radius.value=T.radius,s.setRenderTarget(T.mapPass),s.clear(),s.renderBufferDirect(w,null,R,d,_,null),p.uniforms.shadow_pass.value=T.mapPass.texture,p.uniforms.resolution.value=T.mapSize,p.uniforms.radius.value=T.radius,s.setRenderTarget(T.map),s.clear(),s.renderBufferDirect(w,null,R,p,_,null)}function S(T,w,R,M){let y=null,I=R.isPointLight===!0?T.customDistanceMaterial:T.customDepthMaterial;if(I!==void 0)y=I;else if(y=R.isPointLight===!0?c:a,s.localClippingEnabled&&w.clipShadows===!0&&Array.isArray(w.clippingPlanes)&&w.clippingPlanes.length!==0||w.displacementMap&&w.displacementScale!==0||w.alphaMap&&w.alphaTest>0||w.map&&w.alphaTest>0){let F=y.uuid,U=w.uuid,O=l[F];O===void 0&&(O={},l[F]=O);let $=O[U];$===void 0&&($=y.clone(),O[U]=$,w.addEventListener("dispose",P)),y=$}if(y.visible=w.visible,y.wireframe=w.wireframe,M===di?y.side=w.shadowSide!==null?w.shadowSide:w.side:y.side=w.shadowSide!==null?w.shadowSide:u[w.side],y.alphaMap=w.alphaMap,y.alphaTest=w.alphaTest,y.map=w.map,y.clipShadows=w.clipShadows,y.clippingPlanes=w.clippingPlanes,y.clipIntersection=w.clipIntersection,y.displacementMap=w.displacementMap,y.displacementScale=w.displacementScale,y.displacementBias=w.displacementBias,y.wireframeLinewidth=w.wireframeLinewidth,y.linewidth=w.linewidth,R.isPointLight===!0&&y.isMeshDistanceMaterial===!0){let F=s.properties.get(y);F.light=R}return y}function x(T,w,R,M,y){if(T.visible===!1)return;if(T.layers.test(w.layers)&&(T.isMesh||T.isLine||T.isPoints)&&(T.castShadow||T.receiveShadow&&y===di)&&(!T.frustumCulled||n.intersectsObject(T))){T.modelViewMatrix.multiplyMatrices(R.matrixWorldInverse,T.matrixWorld);let U=e.update(T),O=T.material;if(Array.isArray(O)){let $=U.groups;for(let k=0,ee=$.length;k<ee;k++){let Y=$[k],ce=O[Y.materialIndex];if(ce&&ce.visible){let pe=S(T,ce,M,y);T.onBeforeShadow(s,T,w,R,U,pe,Y),s.renderBufferDirect(R,null,U,pe,T,Y),T.onAfterShadow(s,T,w,R,U,pe,Y)}}}else if(O.visible){let $=S(T,O,M,y);T.onBeforeShadow(s,T,w,R,U,$,null),s.renderBufferDirect(R,null,U,$,T,null),T.onAfterShadow(s,T,w,R,U,$,null)}}let F=T.children;for(let U=0,O=F.length;U<O;U++)x(F[U],w,R,M,y)}function P(T){T.target.removeEventListener("dispose",P);for(let R in l){let M=l[R],y=T.target.uuid;y in M&&(M[y].dispose(),delete M[y])}}}var Xx={[Ia]:Pa,[La]:Na,[Da]:Fa,[fs]:Ua,[Pa]:Ia,[Na]:La,[Fa]:Da,[Ua]:fs};function Yx(s,e){function t(){let N=!1,de=new _t,j=null,se=new _t(0,0,0,0);return{setMask:function(fe){j!==fe&&!N&&(s.colorMask(fe,fe,fe,fe),j=fe)},setLocked:function(fe){N=fe},setClear:function(fe,me,He,Et,Ct){Ct===!0&&(fe*=Et,me*=Et,He*=Et),de.set(fe,me,He,Et),se.equals(de)===!1&&(s.clearColor(fe,me,He,Et),se.copy(de))},reset:function(){N=!1,j=null,se.set(-1,0,0,0)}}}function n(){let N=!1,de=!1,j=null,se=null,fe=null;return{setReversed:function(me){if(de!==me){let He=e.get("EXT_clip_control");de?He.clipControlEXT(He.LOWER_LEFT_EXT,He.ZERO_TO_ONE_EXT):He.clipControlEXT(He.LOWER_LEFT_EXT,He.NEGATIVE_ONE_TO_ONE_EXT);let Et=fe;fe=null,this.setClear(Et)}de=me},getReversed:function(){return de},setTest:function(me){me?ye(s.DEPTH_TEST):Be(s.DEPTH_TEST)},setMask:function(me){j!==me&&!N&&(s.depthMask(me),j=me)},setFunc:function(me){if(de&&(me=Xx[me]),se!==me){switch(me){case Ia:s.depthFunc(s.NEVER);break;case Pa:s.depthFunc(s.ALWAYS);break;case La:s.depthFunc(s.LESS);break;case fs:s.depthFunc(s.LEQUAL);break;case Da:s.depthFunc(s.EQUAL);break;case Ua:s.depthFunc(s.GEQUAL);break;case Na:s.depthFunc(s.GREATER);break;case Fa:s.depthFunc(s.NOTEQUAL);break;default:s.depthFunc(s.LEQUAL)}se=me}},setLocked:function(me){N=me},setClear:function(me){fe!==me&&(de&&(me=1-me),s.clearDepth(me),fe=me)},reset:function(){N=!1,j=null,se=null,fe=null,de=!1}}}function i(){let N=!1,de=null,j=null,se=null,fe=null,me=null,He=null,Et=null,Ct=null;return{setTest:function(nt){N||(nt?ye(s.STENCIL_TEST):Be(s.STENCIL_TEST))},setMask:function(nt){de!==nt&&!N&&(s.stencilMask(nt),de=nt)},setFunc:function(nt,Dt,Ot){(j!==nt||se!==Dt||fe!==Ot)&&(s.stencilFunc(nt,Dt,Ot),j=nt,se=Dt,fe=Ot)},setOp:function(nt,Dt,Ot){(me!==nt||He!==Dt||Et!==Ot)&&(s.stencilOp(nt,Dt,Ot),me=nt,He=Dt,Et=Ot)},setLocked:function(nt){N=nt},setClear:function(nt){Ct!==nt&&(s.clearStencil(nt),Ct=nt)},reset:function(){N=!1,de=null,j=null,se=null,fe=null,me=null,He=null,Et=null,Ct=null}}}let r=new t,o=new n,a=new i,c=new WeakMap,l=new WeakMap,h={},u={},d=new WeakMap,p=[],g=null,_=!1,m=null,f=null,v=null,S=null,x=null,P=null,T=null,w=new ge(0,0,0),R=0,M=!1,y=null,I=null,F=null,U=null,O=null,$=s.getParameter(s.MAX_COMBINED_TEXTURE_IMAGE_UNITS),k=!1,ee=0,Y=s.getParameter(s.VERSION);Y.indexOf("WebGL")!==-1?(ee=parseFloat(/^WebGL (\d)/.exec(Y)[1]),k=ee>=1):Y.indexOf("OpenGL ES")!==-1&&(ee=parseFloat(/^OpenGL ES (\d)/.exec(Y)[1]),k=ee>=2);let ce=null,pe={},Ie=s.getParameter(s.SCISSOR_BOX),Ue=s.getParameter(s.VIEWPORT),Ge=new _t().fromArray(Ie),te=new _t().fromArray(Ue);function ue(N,de,j,se){let fe=new Uint8Array(4),me=s.createTexture();s.bindTexture(N,me),s.texParameteri(N,s.TEXTURE_MIN_FILTER,s.NEAREST),s.texParameteri(N,s.TEXTURE_MAG_FILTER,s.NEAREST);for(let He=0;He<j;He++)N===s.TEXTURE_3D||N===s.TEXTURE_2D_ARRAY?s.texImage3D(de,0,s.RGBA,1,1,se,0,s.RGBA,s.UNSIGNED_BYTE,fe):s.texImage2D(de+He,0,s.RGBA,1,1,0,s.RGBA,s.UNSIGNED_BYTE,fe);return me}let Ae={};Ae[s.TEXTURE_2D]=ue(s.TEXTURE_2D,s.TEXTURE_2D,1),Ae[s.TEXTURE_CUBE_MAP]=ue(s.TEXTURE_CUBE_MAP,s.TEXTURE_CUBE_MAP_POSITIVE_X,6),Ae[s.TEXTURE_2D_ARRAY]=ue(s.TEXTURE_2D_ARRAY,s.TEXTURE_2D_ARRAY,1,1),Ae[s.TEXTURE_3D]=ue(s.TEXTURE_3D,s.TEXTURE_3D,1,1),r.setClear(0,0,0,1),o.setClear(1),a.setClear(0),ye(s.DEPTH_TEST),o.setFunc(fs),rt(!1),ot(Tl),ye(s.CULL_FACE),L(Ui);function ye(N){h[N]!==!0&&(s.enable(N),h[N]=!0)}function Be(N){h[N]!==!1&&(s.disable(N),h[N]=!1)}function qe(N,de){return u[N]!==de?(s.bindFramebuffer(N,de),u[N]=de,N===s.DRAW_FRAMEBUFFER&&(u[s.FRAMEBUFFER]=de),N===s.FRAMEBUFFER&&(u[s.DRAW_FRAMEBUFFER]=de),!0):!1}function Fe(N,de){let j=p,se=!1;if(N){j=d.get(de),j===void 0&&(j=[],d.set(de,j));let fe=N.textures;if(j.length!==fe.length||j[0]!==s.COLOR_ATTACHMENT0){for(let me=0,He=fe.length;me<He;me++)j[me]=s.COLOR_ATTACHMENT0+me;j.length=fe.length,se=!0}}else j[0]!==s.BACK&&(j[0]=s.BACK,se=!0);se&&s.drawBuffers(j)}function Ne(N){return g!==N?(s.useProgram(N),g=N,!0):!1}let et={[qi]:s.FUNC_ADD,[Ju]:s.FUNC_SUBTRACT,[$u]:s.FUNC_REVERSE_SUBTRACT};et[ju]=s.MIN,et[Qu]=s.MAX;let Ke={[ed]:s.ZERO,[td]:s.ONE,[nd]:s.SRC_COLOR,[ha]:s.SRC_ALPHA,[cd]:s.SRC_ALPHA_SATURATE,[od]:s.DST_COLOR,[sd]:s.DST_ALPHA,[id]:s.ONE_MINUS_SRC_COLOR,[ua]:s.ONE_MINUS_SRC_ALPHA,[ad]:s.ONE_MINUS_DST_COLOR,[rd]:s.ONE_MINUS_DST_ALPHA,[ld]:s.CONSTANT_COLOR,[hd]:s.ONE_MINUS_CONSTANT_COLOR,[ud]:s.CONSTANT_ALPHA,[dd]:s.ONE_MINUS_CONSTANT_ALPHA};function L(N,de,j,se,fe,me,He,Et,Ct,nt){if(N===Ui){_===!0&&(Be(s.BLEND),_=!1);return}if(_===!1&&(ye(s.BLEND),_=!0),N!==Ku){if(N!==m||nt!==M){if((f!==qi||x!==qi)&&(s.blendEquation(s.FUNC_ADD),f=qi,x=qi),nt)switch(N){case ds:s.blendFuncSeparate(s.ONE,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case jn:s.blendFunc(s.ONE,s.ONE);break;case wl:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case Rl:s.blendFuncSeparate(s.ZERO,s.SRC_COLOR,s.ZERO,s.SRC_ALPHA);break;default:console.error("THREE.WebGLState: Invalid blending: ",N);break}else switch(N){case ds:s.blendFuncSeparate(s.SRC_ALPHA,s.ONE_MINUS_SRC_ALPHA,s.ONE,s.ONE_MINUS_SRC_ALPHA);break;case jn:s.blendFunc(s.SRC_ALPHA,s.ONE);break;case wl:s.blendFuncSeparate(s.ZERO,s.ONE_MINUS_SRC_COLOR,s.ZERO,s.ONE);break;case Rl:s.blendFunc(s.ZERO,s.SRC_COLOR);break;default:console.error("THREE.WebGLState: Invalid blending: ",N);break}v=null,S=null,P=null,T=null,w.set(0,0,0),R=0,m=N,M=nt}return}fe=fe||de,me=me||j,He=He||se,(de!==f||fe!==x)&&(s.blendEquationSeparate(et[de],et[fe]),f=de,x=fe),(j!==v||se!==S||me!==P||He!==T)&&(s.blendFuncSeparate(Ke[j],Ke[se],Ke[me],Ke[He]),v=j,S=se,P=me,T=He),(Et.equals(w)===!1||Ct!==R)&&(s.blendColor(Et.r,Et.g,Et.b,Ct),w.copy(Et),R=Ct),m=N,M=!1}function on(N,de){N.side===kt?Be(s.CULL_FACE):ye(s.CULL_FACE);let j=N.side===Vt;de&&(j=!j),rt(j),N.blending===ds&&N.transparent===!1?L(Ui):L(N.blending,N.blendEquation,N.blendSrc,N.blendDst,N.blendEquationAlpha,N.blendSrcAlpha,N.blendDstAlpha,N.blendColor,N.blendAlpha,N.premultipliedAlpha),o.setFunc(N.depthFunc),o.setTest(N.depthTest),o.setMask(N.depthWrite),r.setMask(N.colorWrite);let se=N.stencilWrite;a.setTest(se),se&&(a.setMask(N.stencilWriteMask),a.setFunc(N.stencilFunc,N.stencilRef,N.stencilFuncMask),a.setOp(N.stencilFail,N.stencilZFail,N.stencilZPass)),gt(N.polygonOffset,N.polygonOffsetFactor,N.polygonOffsetUnits),N.alphaToCoverage===!0?ye(s.SAMPLE_ALPHA_TO_COVERAGE):Be(s.SAMPLE_ALPHA_TO_COVERAGE)}function rt(N){y!==N&&(N?s.frontFace(s.CW):s.frontFace(s.CCW),y=N)}function ot(N){N!==qu?(ye(s.CULL_FACE),N!==I&&(N===Tl?s.cullFace(s.BACK):N===Zu?s.cullFace(s.FRONT):s.cullFace(s.FRONT_AND_BACK))):Be(s.CULL_FACE),I=N}function ve(N){N!==F&&(k&&s.lineWidth(N),F=N)}function gt(N,de,j){N?(ye(s.POLYGON_OFFSET_FILL),(U!==de||O!==j)&&(s.polygonOffset(de,j),U=de,O=j)):Be(s.POLYGON_OFFSET_FILL)}function Ce(N){N?ye(s.SCISSOR_TEST):Be(s.SCISSOR_TEST)}function A(N){N===void 0&&(N=s.TEXTURE0+$-1),ce!==N&&(s.activeTexture(N),ce=N)}function b(N,de,j){j===void 0&&(ce===null?j=s.TEXTURE0+$-1:j=ce);let se=pe[j];se===void 0&&(se={type:void 0,texture:void 0},pe[j]=se),(se.type!==N||se.texture!==de)&&(ce!==j&&(s.activeTexture(j),ce=j),s.bindTexture(N,de||Ae[N]),se.type=N,se.texture=de)}function W(){let N=pe[ce];N!==void 0&&N.type!==void 0&&(s.bindTexture(N.type,null),N.type=void 0,N.texture=void 0)}function ie(){try{s.compressedTexImage2D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function ne(){try{s.compressedTexImage3D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function Z(){try{s.texSubImage2D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function xe(){try{s.texSubImage3D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function _e(){try{s.compressedTexSubImage2D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function be(){try{s.compressedTexSubImage3D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function We(){try{s.texStorage2D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function le(){try{s.texStorage3D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function Ee(){try{s.texImage2D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function Pe(){try{s.texImage3D(...arguments)}catch(N){console.error("THREE.WebGLState:",N)}}function Oe(N){Ge.equals(N)===!1&&(s.scissor(N.x,N.y,N.z,N.w),Ge.copy(N))}function Se(N){te.equals(N)===!1&&(s.viewport(N.x,N.y,N.z,N.w),te.copy(N))}function tt(N,de){let j=l.get(de);j===void 0&&(j=new WeakMap,l.set(de,j));let se=j.get(N);se===void 0&&(se=s.getUniformBlockIndex(de,N.name),j.set(N,se))}function ze(N,de){let se=l.get(de).get(N);c.get(de)!==se&&(s.uniformBlockBinding(de,se,N.__bindingPointIndex),c.set(de,se))}function mt(){s.disable(s.BLEND),s.disable(s.CULL_FACE),s.disable(s.DEPTH_TEST),s.disable(s.POLYGON_OFFSET_FILL),s.disable(s.SCISSOR_TEST),s.disable(s.STENCIL_TEST),s.disable(s.SAMPLE_ALPHA_TO_COVERAGE),s.blendEquation(s.FUNC_ADD),s.blendFunc(s.ONE,s.ZERO),s.blendFuncSeparate(s.ONE,s.ZERO,s.ONE,s.ZERO),s.blendColor(0,0,0,0),s.colorMask(!0,!0,!0,!0),s.clearColor(0,0,0,0),s.depthMask(!0),s.depthFunc(s.LESS),o.setReversed(!1),s.clearDepth(1),s.stencilMask(4294967295),s.stencilFunc(s.ALWAYS,0,4294967295),s.stencilOp(s.KEEP,s.KEEP,s.KEEP),s.clearStencil(0),s.cullFace(s.BACK),s.frontFace(s.CCW),s.polygonOffset(0,0),s.activeTexture(s.TEXTURE0),s.bindFramebuffer(s.FRAMEBUFFER,null),s.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),s.bindFramebuffer(s.READ_FRAMEBUFFER,null),s.useProgram(null),s.lineWidth(1),s.scissor(0,0,s.canvas.width,s.canvas.height),s.viewport(0,0,s.canvas.width,s.canvas.height),h={},ce=null,pe={},u={},d=new WeakMap,p=[],g=null,_=!1,m=null,f=null,v=null,S=null,x=null,P=null,T=null,w=new ge(0,0,0),R=0,M=!1,y=null,I=null,F=null,U=null,O=null,Ge.set(0,0,s.canvas.width,s.canvas.height),te.set(0,0,s.canvas.width,s.canvas.height),r.reset(),o.reset(),a.reset()}return{buffers:{color:r,depth:o,stencil:a},enable:ye,disable:Be,bindFramebuffer:qe,drawBuffers:Fe,useProgram:Ne,setBlending:L,setMaterial:on,setFlipSided:rt,setCullFace:ot,setLineWidth:ve,setPolygonOffset:gt,setScissorTest:Ce,activeTexture:A,bindTexture:b,unbindTexture:W,compressedTexImage2D:ie,compressedTexImage3D:ne,texImage2D:Ee,texImage3D:Pe,updateUBOMapping:tt,uniformBlockBinding:ze,texStorage2D:We,texStorage3D:le,texSubImage2D:Z,texSubImage3D:xe,compressedTexSubImage2D:_e,compressedTexSubImage3D:be,scissor:Oe,viewport:Se,reset:mt}}function qx(s,e,t,n,i,r,o){let a=e.has("WEBGL_multisampled_render_to_texture")?e.get("WEBGL_multisampled_render_to_texture"):null,c=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),l=new ke,h=new WeakMap,u,d=new WeakMap,p=!1;try{p=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function g(A,b){return p?new OffscreenCanvas(A,b):lr("canvas")}function _(A,b,W){let ie=1,ne=Ce(A);if((ne.width>W||ne.height>W)&&(ie=W/Math.max(ne.width,ne.height)),ie<1)if(typeof HTMLImageElement<"u"&&A instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&A instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&A instanceof ImageBitmap||typeof VideoFrame<"u"&&A instanceof VideoFrame){let Z=Math.floor(ie*ne.width),xe=Math.floor(ie*ne.height);u===void 0&&(u=g(Z,xe));let _e=b?g(Z,xe):u;return _e.width=Z,_e.height=xe,_e.getContext("2d").drawImage(A,0,0,Z,xe),console.warn("THREE.WebGLRenderer: Texture has been resized from ("+ne.width+"x"+ne.height+") to ("+Z+"x"+xe+")."),_e}else return"data"in A&&console.warn("THREE.WebGLRenderer: Image in DataTexture is too big ("+ne.width+"x"+ne.height+")."),A;return A}function m(A){return A.generateMipmaps}function f(A){s.generateMipmap(A)}function v(A){return A.isWebGLCubeRenderTarget?s.TEXTURE_CUBE_MAP:A.isWebGL3DRenderTarget?s.TEXTURE_3D:A.isWebGLArrayRenderTarget||A.isCompressedArrayTexture?s.TEXTURE_2D_ARRAY:s.TEXTURE_2D}function S(A,b,W,ie,ne=!1){if(A!==null){if(s[A]!==void 0)return s[A];console.warn("THREE.WebGLRenderer: Attempt to use non-existing WebGL internal format '"+A+"'")}let Z=b;if(b===s.RED&&(W===s.FLOAT&&(Z=s.R32F),W===s.HALF_FLOAT&&(Z=s.R16F),W===s.UNSIGNED_BYTE&&(Z=s.R8)),b===s.RED_INTEGER&&(W===s.UNSIGNED_BYTE&&(Z=s.R8UI),W===s.UNSIGNED_SHORT&&(Z=s.R16UI),W===s.UNSIGNED_INT&&(Z=s.R32UI),W===s.BYTE&&(Z=s.R8I),W===s.SHORT&&(Z=s.R16I),W===s.INT&&(Z=s.R32I)),b===s.RG&&(W===s.FLOAT&&(Z=s.RG32F),W===s.HALF_FLOAT&&(Z=s.RG16F),W===s.UNSIGNED_BYTE&&(Z=s.RG8)),b===s.RG_INTEGER&&(W===s.UNSIGNED_BYTE&&(Z=s.RG8UI),W===s.UNSIGNED_SHORT&&(Z=s.RG16UI),W===s.UNSIGNED_INT&&(Z=s.RG32UI),W===s.BYTE&&(Z=s.RG8I),W===s.SHORT&&(Z=s.RG16I),W===s.INT&&(Z=s.RG32I)),b===s.RGB_INTEGER&&(W===s.UNSIGNED_BYTE&&(Z=s.RGB8UI),W===s.UNSIGNED_SHORT&&(Z=s.RGB16UI),W===s.UNSIGNED_INT&&(Z=s.RGB32UI),W===s.BYTE&&(Z=s.RGB8I),W===s.SHORT&&(Z=s.RGB16I),W===s.INT&&(Z=s.RGB32I)),b===s.RGBA_INTEGER&&(W===s.UNSIGNED_BYTE&&(Z=s.RGBA8UI),W===s.UNSIGNED_SHORT&&(Z=s.RGBA16UI),W===s.UNSIGNED_INT&&(Z=s.RGBA32UI),W===s.BYTE&&(Z=s.RGBA8I),W===s.SHORT&&(Z=s.RGBA16I),W===s.INT&&(Z=s.RGBA32I)),b===s.RGB&&W===s.UNSIGNED_INT_5_9_9_9_REV&&(Z=s.RGB9_E5),b===s.RGBA){let xe=ne?Xr:ft.getTransfer(ie);W===s.FLOAT&&(Z=s.RGBA32F),W===s.HALF_FLOAT&&(Z=s.RGBA16F),W===s.UNSIGNED_BYTE&&(Z=xe===At?s.SRGB8_ALPHA8:s.RGBA8),W===s.UNSIGNED_SHORT_4_4_4_4&&(Z=s.RGBA4),W===s.UNSIGNED_SHORT_5_5_5_1&&(Z=s.RGB5_A1)}return(Z===s.R16F||Z===s.R32F||Z===s.RG16F||Z===s.RG32F||Z===s.RGBA16F||Z===s.RGBA32F)&&e.get("EXT_color_buffer_float"),Z}function x(A,b){let W;return A?b===null||b===es||b===Us?W=s.DEPTH24_STENCIL8:b===gn?W=s.DEPTH32F_STENCIL8:b===gr&&(W=s.DEPTH24_STENCIL8,console.warn("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):b===null||b===es||b===Us?W=s.DEPTH_COMPONENT24:b===gn?W=s.DEPTH_COMPONENT32F:b===gr&&(W=s.DEPTH_COMPONENT16),W}function P(A,b){return m(A)===!0||A.isFramebufferTexture&&A.minFilter!==ln&&A.minFilter!==Nt?Math.log2(Math.max(b.width,b.height))+1:A.mipmaps!==void 0&&A.mipmaps.length>0?A.mipmaps.length:A.isCompressedTexture&&Array.isArray(A.image)?b.mipmaps.length:1}function T(A){let b=A.target;b.removeEventListener("dispose",T),R(b),b.isVideoTexture&&h.delete(b)}function w(A){let b=A.target;b.removeEventListener("dispose",w),y(b)}function R(A){let b=n.get(A);if(b.__webglInit===void 0)return;let W=A.source,ie=d.get(W);if(ie){let ne=ie[b.__cacheKey];ne.usedTimes--,ne.usedTimes===0&&M(A),Object.keys(ie).length===0&&d.delete(W)}n.remove(A)}function M(A){let b=n.get(A);s.deleteTexture(b.__webglTexture);let W=A.source,ie=d.get(W);delete ie[b.__cacheKey],o.memory.textures--}function y(A){let b=n.get(A);if(A.depthTexture&&(A.depthTexture.dispose(),n.remove(A.depthTexture)),A.isWebGLCubeRenderTarget)for(let ie=0;ie<6;ie++){if(Array.isArray(b.__webglFramebuffer[ie]))for(let ne=0;ne<b.__webglFramebuffer[ie].length;ne++)s.deleteFramebuffer(b.__webglFramebuffer[ie][ne]);else s.deleteFramebuffer(b.__webglFramebuffer[ie]);b.__webglDepthbuffer&&s.deleteRenderbuffer(b.__webglDepthbuffer[ie])}else{if(Array.isArray(b.__webglFramebuffer))for(let ie=0;ie<b.__webglFramebuffer.length;ie++)s.deleteFramebuffer(b.__webglFramebuffer[ie]);else s.deleteFramebuffer(b.__webglFramebuffer);if(b.__webglDepthbuffer&&s.deleteRenderbuffer(b.__webglDepthbuffer),b.__webglMultisampledFramebuffer&&s.deleteFramebuffer(b.__webglMultisampledFramebuffer),b.__webglColorRenderbuffer)for(let ie=0;ie<b.__webglColorRenderbuffer.length;ie++)b.__webglColorRenderbuffer[ie]&&s.deleteRenderbuffer(b.__webglColorRenderbuffer[ie]);b.__webglDepthRenderbuffer&&s.deleteRenderbuffer(b.__webglDepthRenderbuffer)}let W=A.textures;for(let ie=0,ne=W.length;ie<ne;ie++){let Z=n.get(W[ie]);Z.__webglTexture&&(s.deleteTexture(Z.__webglTexture),o.memory.textures--),n.remove(W[ie])}n.remove(A)}let I=0;function F(){I=0}function U(){let A=I;return A>=i.maxTextures&&console.warn("THREE.WebGLTextures: Trying to use "+A+" texture units while this GPU supports only "+i.maxTextures),I+=1,A}function O(A){let b=[];return b.push(A.wrapS),b.push(A.wrapT),b.push(A.wrapR||0),b.push(A.magFilter),b.push(A.minFilter),b.push(A.anisotropy),b.push(A.internalFormat),b.push(A.format),b.push(A.type),b.push(A.generateMipmaps),b.push(A.premultiplyAlpha),b.push(A.flipY),b.push(A.unpackAlignment),b.push(A.colorSpace),b.join()}function $(A,b){let W=n.get(A);if(A.isVideoTexture&&ve(A),A.isRenderTargetTexture===!1&&A.version>0&&W.__version!==A.version){let ie=A.image;if(ie===null)console.warn("THREE.WebGLRenderer: Texture marked for update but no image data found.");else if(ie.complete===!1)console.warn("THREE.WebGLRenderer: Texture marked for update but image is incomplete");else{te(W,A,b);return}}t.bindTexture(s.TEXTURE_2D,W.__webglTexture,s.TEXTURE0+b)}function k(A,b){let W=n.get(A);if(A.version>0&&W.__version!==A.version){te(W,A,b);return}t.bindTexture(s.TEXTURE_2D_ARRAY,W.__webglTexture,s.TEXTURE0+b)}function ee(A,b){let W=n.get(A);if(A.version>0&&W.__version!==A.version){te(W,A,b);return}t.bindTexture(s.TEXTURE_3D,W.__webglTexture,s.TEXTURE0+b)}function Y(A,b){let W=n.get(A);if(A.version>0&&W.__version!==A.version){ue(W,A,b);return}t.bindTexture(s.TEXTURE_CUBE_MAP,W.__webglTexture,s.TEXTURE0+b)}let ce={[bt]:s.REPEAT,[Mn]:s.CLAMP_TO_EDGE,[cr]:s.MIRRORED_REPEAT},pe={[ln]:s.NEAREST,[za]:s.NEAREST_MIPMAP_NEAREST,[Ds]:s.NEAREST_MIPMAP_LINEAR,[Nt]:s.LINEAR,[mr]:s.LINEAR_MIPMAP_NEAREST,[Bn]:s.LINEAR_MIPMAP_LINEAR},Ie={[Ad]:s.NEVER,[Ld]:s.ALWAYS,[wd]:s.LESS,[Gl]:s.LEQUAL,[Rd]:s.EQUAL,[Pd]:s.GEQUAL,[Cd]:s.GREATER,[Id]:s.NOTEQUAL};function Ue(A,b){if(b.type===gn&&e.has("OES_texture_float_linear")===!1&&(b.magFilter===Nt||b.magFilter===mr||b.magFilter===Ds||b.magFilter===Bn||b.minFilter===Nt||b.minFilter===mr||b.minFilter===Ds||b.minFilter===Bn)&&console.warn("THREE.WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),s.texParameteri(A,s.TEXTURE_WRAP_S,ce[b.wrapS]),s.texParameteri(A,s.TEXTURE_WRAP_T,ce[b.wrapT]),(A===s.TEXTURE_3D||A===s.TEXTURE_2D_ARRAY)&&s.texParameteri(A,s.TEXTURE_WRAP_R,ce[b.wrapR]),s.texParameteri(A,s.TEXTURE_MAG_FILTER,pe[b.magFilter]),s.texParameteri(A,s.TEXTURE_MIN_FILTER,pe[b.minFilter]),b.compareFunction&&(s.texParameteri(A,s.TEXTURE_COMPARE_MODE,s.COMPARE_REF_TO_TEXTURE),s.texParameteri(A,s.TEXTURE_COMPARE_FUNC,Ie[b.compareFunction])),e.has("EXT_texture_filter_anisotropic")===!0){if(b.magFilter===ln||b.minFilter!==Ds&&b.minFilter!==Bn||b.type===gn&&e.has("OES_texture_float_linear")===!1)return;if(b.anisotropy>1||n.get(b).__currentAnisotropy){let W=e.get("EXT_texture_filter_anisotropic");s.texParameterf(A,W.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(b.anisotropy,i.getMaxAnisotropy())),n.get(b).__currentAnisotropy=b.anisotropy}}}function Ge(A,b){let W=!1;A.__webglInit===void 0&&(A.__webglInit=!0,b.addEventListener("dispose",T));let ie=b.source,ne=d.get(ie);ne===void 0&&(ne={},d.set(ie,ne));let Z=O(b);if(Z!==A.__cacheKey){ne[Z]===void 0&&(ne[Z]={texture:s.createTexture(),usedTimes:0},o.memory.textures++,W=!0),ne[Z].usedTimes++;let xe=ne[A.__cacheKey];xe!==void 0&&(ne[A.__cacheKey].usedTimes--,xe.usedTimes===0&&M(b)),A.__cacheKey=Z,A.__webglTexture=ne[Z].texture}return W}function te(A,b,W){let ie=s.TEXTURE_2D;(b.isDataArrayTexture||b.isCompressedArrayTexture)&&(ie=s.TEXTURE_2D_ARRAY),b.isData3DTexture&&(ie=s.TEXTURE_3D);let ne=Ge(A,b),Z=b.source;t.bindTexture(ie,A.__webglTexture,s.TEXTURE0+W);let xe=n.get(Z);if(Z.version!==xe.__version||ne===!0){t.activeTexture(s.TEXTURE0+W);let _e=ft.getPrimaries(ft.workingColorSpace),be=b.colorSpace===Fi?null:ft.getPrimaries(b.colorSpace),We=b.colorSpace===Fi||_e===be?s.NONE:s.BROWSER_DEFAULT_WEBGL;s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,b.flipY),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,b.premultiplyAlpha),s.pixelStorei(s.UNPACK_ALIGNMENT,b.unpackAlignment),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,We);let le=_(b.image,!1,i.maxTextureSize);le=gt(b,le);let Ee=r.convert(b.format,b.colorSpace),Pe=r.convert(b.type),Oe=S(b.internalFormat,Ee,Pe,b.colorSpace,b.isVideoTexture);Ue(ie,b);let Se,tt=b.mipmaps,ze=b.isVideoTexture!==!0,mt=xe.__version===void 0||ne===!0,N=Z.dataReady,de=P(b,le);if(b.isDepthTexture)Oe=x(b.format===ps,b.type),mt&&(ze?t.texStorage2D(s.TEXTURE_2D,1,Oe,le.width,le.height):t.texImage2D(s.TEXTURE_2D,0,Oe,le.width,le.height,0,Ee,Pe,null));else if(b.isDataTexture)if(tt.length>0){ze&&mt&&t.texStorage2D(s.TEXTURE_2D,de,Oe,tt[0].width,tt[0].height);for(let j=0,se=tt.length;j<se;j++)Se=tt[j],ze?N&&t.texSubImage2D(s.TEXTURE_2D,j,0,0,Se.width,Se.height,Ee,Pe,Se.data):t.texImage2D(s.TEXTURE_2D,j,Oe,Se.width,Se.height,0,Ee,Pe,Se.data);b.generateMipmaps=!1}else ze?(mt&&t.texStorage2D(s.TEXTURE_2D,de,Oe,le.width,le.height),N&&t.texSubImage2D(s.TEXTURE_2D,0,0,0,le.width,le.height,Ee,Pe,le.data)):t.texImage2D(s.TEXTURE_2D,0,Oe,le.width,le.height,0,Ee,Pe,le.data);else if(b.isCompressedTexture)if(b.isCompressedArrayTexture){ze&&mt&&t.texStorage3D(s.TEXTURE_2D_ARRAY,de,Oe,tt[0].width,tt[0].height,le.depth);for(let j=0,se=tt.length;j<se;j++)if(Se=tt[j],b.format!==Pn)if(Ee!==null)if(ze){if(N)if(b.layerUpdates.size>0){let fe=Jl(Se.width,Se.height,b.format,b.type);for(let me of b.layerUpdates){let He=Se.data.subarray(me*fe/Se.data.BYTES_PER_ELEMENT,(me+1)*fe/Se.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,j,0,0,me,Se.width,Se.height,1,Ee,He)}b.clearLayerUpdates()}else t.compressedTexSubImage3D(s.TEXTURE_2D_ARRAY,j,0,0,0,Se.width,Se.height,le.depth,Ee,Se.data)}else t.compressedTexImage3D(s.TEXTURE_2D_ARRAY,j,Oe,Se.width,Se.height,le.depth,0,Se.data,0,0);else console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else ze?N&&t.texSubImage3D(s.TEXTURE_2D_ARRAY,j,0,0,0,Se.width,Se.height,le.depth,Ee,Pe,Se.data):t.texImage3D(s.TEXTURE_2D_ARRAY,j,Oe,Se.width,Se.height,le.depth,0,Ee,Pe,Se.data)}else{ze&&mt&&t.texStorage2D(s.TEXTURE_2D,de,Oe,tt[0].width,tt[0].height);for(let j=0,se=tt.length;j<se;j++)Se=tt[j],b.format!==Pn?Ee!==null?ze?N&&t.compressedTexSubImage2D(s.TEXTURE_2D,j,0,0,Se.width,Se.height,Ee,Se.data):t.compressedTexImage2D(s.TEXTURE_2D,j,Oe,Se.width,Se.height,0,Se.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):ze?N&&t.texSubImage2D(s.TEXTURE_2D,j,0,0,Se.width,Se.height,Ee,Pe,Se.data):t.texImage2D(s.TEXTURE_2D,j,Oe,Se.width,Se.height,0,Ee,Pe,Se.data)}else if(b.isDataArrayTexture)if(ze){if(mt&&t.texStorage3D(s.TEXTURE_2D_ARRAY,de,Oe,le.width,le.height,le.depth),N)if(b.layerUpdates.size>0){let j=Jl(le.width,le.height,b.format,b.type);for(let se of b.layerUpdates){let fe=le.data.subarray(se*j/le.data.BYTES_PER_ELEMENT,(se+1)*j/le.data.BYTES_PER_ELEMENT);t.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,se,le.width,le.height,1,Ee,Pe,fe)}b.clearLayerUpdates()}else t.texSubImage3D(s.TEXTURE_2D_ARRAY,0,0,0,0,le.width,le.height,le.depth,Ee,Pe,le.data)}else t.texImage3D(s.TEXTURE_2D_ARRAY,0,Oe,le.width,le.height,le.depth,0,Ee,Pe,le.data);else if(b.isData3DTexture)ze?(mt&&t.texStorage3D(s.TEXTURE_3D,de,Oe,le.width,le.height,le.depth),N&&t.texSubImage3D(s.TEXTURE_3D,0,0,0,0,le.width,le.height,le.depth,Ee,Pe,le.data)):t.texImage3D(s.TEXTURE_3D,0,Oe,le.width,le.height,le.depth,0,Ee,Pe,le.data);else if(b.isFramebufferTexture){if(mt)if(ze)t.texStorage2D(s.TEXTURE_2D,de,Oe,le.width,le.height);else{let j=le.width,se=le.height;for(let fe=0;fe<de;fe++)t.texImage2D(s.TEXTURE_2D,fe,Oe,j,se,0,Ee,Pe,null),j>>=1,se>>=1}}else if(tt.length>0){if(ze&&mt){let j=Ce(tt[0]);t.texStorage2D(s.TEXTURE_2D,de,Oe,j.width,j.height)}for(let j=0,se=tt.length;j<se;j++)Se=tt[j],ze?N&&t.texSubImage2D(s.TEXTURE_2D,j,0,0,Ee,Pe,Se):t.texImage2D(s.TEXTURE_2D,j,Oe,Ee,Pe,Se);b.generateMipmaps=!1}else if(ze){if(mt){let j=Ce(le);t.texStorage2D(s.TEXTURE_2D,de,Oe,j.width,j.height)}N&&t.texSubImage2D(s.TEXTURE_2D,0,0,0,Ee,Pe,le)}else t.texImage2D(s.TEXTURE_2D,0,Oe,Ee,Pe,le);m(b)&&f(ie),xe.__version=Z.version,b.onUpdate&&b.onUpdate(b)}A.__version=b.version}function ue(A,b,W){if(b.image.length!==6)return;let ie=Ge(A,b),ne=b.source;t.bindTexture(s.TEXTURE_CUBE_MAP,A.__webglTexture,s.TEXTURE0+W);let Z=n.get(ne);if(ne.version!==Z.__version||ie===!0){t.activeTexture(s.TEXTURE0+W);let xe=ft.getPrimaries(ft.workingColorSpace),_e=b.colorSpace===Fi?null:ft.getPrimaries(b.colorSpace),be=b.colorSpace===Fi||xe===_e?s.NONE:s.BROWSER_DEFAULT_WEBGL;s.pixelStorei(s.UNPACK_FLIP_Y_WEBGL,b.flipY),s.pixelStorei(s.UNPACK_PREMULTIPLY_ALPHA_WEBGL,b.premultiplyAlpha),s.pixelStorei(s.UNPACK_ALIGNMENT,b.unpackAlignment),s.pixelStorei(s.UNPACK_COLORSPACE_CONVERSION_WEBGL,be);let We=b.isCompressedTexture||b.image[0].isCompressedTexture,le=b.image[0]&&b.image[0].isDataTexture,Ee=[];for(let se=0;se<6;se++)!We&&!le?Ee[se]=_(b.image[se],!0,i.maxCubemapSize):Ee[se]=le?b.image[se].image:b.image[se],Ee[se]=gt(b,Ee[se]);let Pe=Ee[0],Oe=r.convert(b.format,b.colorSpace),Se=r.convert(b.type),tt=S(b.internalFormat,Oe,Se,b.colorSpace),ze=b.isVideoTexture!==!0,mt=Z.__version===void 0||ie===!0,N=ne.dataReady,de=P(b,Pe);Ue(s.TEXTURE_CUBE_MAP,b);let j;if(We){ze&&mt&&t.texStorage2D(s.TEXTURE_CUBE_MAP,de,tt,Pe.width,Pe.height);for(let se=0;se<6;se++){j=Ee[se].mipmaps;for(let fe=0;fe<j.length;fe++){let me=j[fe];b.format!==Pn?Oe!==null?ze?N&&t.compressedTexSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+se,fe,0,0,me.width,me.height,Oe,me.data):t.compressedTexImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+se,fe,tt,me.width,me.height,0,me.data):console.warn("THREE.WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):ze?N&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+se,fe,0,0,me.width,me.height,Oe,Se,me.data):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+se,fe,tt,me.width,me.height,0,Oe,Se,me.data)}}}else{if(j=b.mipmaps,ze&&mt){j.length>0&&de++;let se=Ce(Ee[0]);t.texStorage2D(s.TEXTURE_CUBE_MAP,de,tt,se.width,se.height)}for(let se=0;se<6;se++)if(le){ze?N&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+se,0,0,0,Ee[se].width,Ee[se].height,Oe,Se,Ee[se].data):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+se,0,tt,Ee[se].width,Ee[se].height,0,Oe,Se,Ee[se].data);for(let fe=0;fe<j.length;fe++){let He=j[fe].image[se].image;ze?N&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+se,fe+1,0,0,He.width,He.height,Oe,Se,He.data):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+se,fe+1,tt,He.width,He.height,0,Oe,Se,He.data)}}else{ze?N&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+se,0,0,0,Oe,Se,Ee[se]):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+se,0,tt,Oe,Se,Ee[se]);for(let fe=0;fe<j.length;fe++){let me=j[fe];ze?N&&t.texSubImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+se,fe+1,0,0,Oe,Se,me.image[se]):t.texImage2D(s.TEXTURE_CUBE_MAP_POSITIVE_X+se,fe+1,tt,Oe,Se,me.image[se])}}}m(b)&&f(s.TEXTURE_CUBE_MAP),Z.__version=ne.version,b.onUpdate&&b.onUpdate(b)}A.__version=b.version}function Ae(A,b,W,ie,ne,Z){let xe=r.convert(W.format,W.colorSpace),_e=r.convert(W.type),be=S(W.internalFormat,xe,_e,W.colorSpace),We=n.get(b),le=n.get(W);if(le.__renderTarget=b,!We.__hasExternalTextures){let Ee=Math.max(1,b.width>>Z),Pe=Math.max(1,b.height>>Z);ne===s.TEXTURE_3D||ne===s.TEXTURE_2D_ARRAY?t.texImage3D(ne,Z,be,Ee,Pe,b.depth,0,xe,_e,null):t.texImage2D(ne,Z,be,Ee,Pe,0,xe,_e,null)}t.bindFramebuffer(s.FRAMEBUFFER,A),ot(b)?a.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,ie,ne,le.__webglTexture,0,rt(b)):(ne===s.TEXTURE_2D||ne>=s.TEXTURE_CUBE_MAP_POSITIVE_X&&ne<=s.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&s.framebufferTexture2D(s.FRAMEBUFFER,ie,ne,le.__webglTexture,Z),t.bindFramebuffer(s.FRAMEBUFFER,null)}function ye(A,b,W){if(s.bindRenderbuffer(s.RENDERBUFFER,A),b.depthBuffer){let ie=b.depthTexture,ne=ie&&ie.isDepthTexture?ie.type:null,Z=x(b.stencilBuffer,ne),xe=b.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,_e=rt(b);ot(b)?a.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,_e,Z,b.width,b.height):W?s.renderbufferStorageMultisample(s.RENDERBUFFER,_e,Z,b.width,b.height):s.renderbufferStorage(s.RENDERBUFFER,Z,b.width,b.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,xe,s.RENDERBUFFER,A)}else{let ie=b.textures;for(let ne=0;ne<ie.length;ne++){let Z=ie[ne],xe=r.convert(Z.format,Z.colorSpace),_e=r.convert(Z.type),be=S(Z.internalFormat,xe,_e,Z.colorSpace),We=rt(b);W&&ot(b)===!1?s.renderbufferStorageMultisample(s.RENDERBUFFER,We,be,b.width,b.height):ot(b)?a.renderbufferStorageMultisampleEXT(s.RENDERBUFFER,We,be,b.width,b.height):s.renderbufferStorage(s.RENDERBUFFER,be,b.width,b.height)}}s.bindRenderbuffer(s.RENDERBUFFER,null)}function Be(A,b){if(b&&b.isWebGLCubeRenderTarget)throw new Error("Depth Texture with cube render targets is not supported");if(t.bindFramebuffer(s.FRAMEBUFFER,A),!(b.depthTexture&&b.depthTexture.isDepthTexture))throw new Error("renderTarget.depthTexture must be an instance of THREE.DepthTexture");let ie=n.get(b.depthTexture);ie.__renderTarget=b,(!ie.__webglTexture||b.depthTexture.image.width!==b.width||b.depthTexture.image.height!==b.height)&&(b.depthTexture.image.width=b.width,b.depthTexture.image.height=b.height,b.depthTexture.needsUpdate=!0),$(b.depthTexture,0);let ne=ie.__webglTexture,Z=rt(b);if(b.depthTexture.format===us)ot(b)?a.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,ne,0,Z):s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_ATTACHMENT,s.TEXTURE_2D,ne,0);else if(b.depthTexture.format===ps)ot(b)?a.framebufferTexture2DMultisampleEXT(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.TEXTURE_2D,ne,0,Z):s.framebufferTexture2D(s.FRAMEBUFFER,s.DEPTH_STENCIL_ATTACHMENT,s.TEXTURE_2D,ne,0);else throw new Error("Unknown depthTexture format")}function qe(A){let b=n.get(A),W=A.isWebGLCubeRenderTarget===!0;if(b.__boundDepthTexture!==A.depthTexture){let ie=A.depthTexture;if(b.__depthDisposeCallback&&b.__depthDisposeCallback(),ie){let ne=()=>{delete b.__boundDepthTexture,delete b.__depthDisposeCallback,ie.removeEventListener("dispose",ne)};ie.addEventListener("dispose",ne),b.__depthDisposeCallback=ne}b.__boundDepthTexture=ie}if(A.depthTexture&&!b.__autoAllocateDepthBuffer){if(W)throw new Error("target.depthTexture not supported in Cube render targets");Be(b.__webglFramebuffer,A)}else if(W){b.__webglDepthbuffer=[];for(let ie=0;ie<6;ie++)if(t.bindFramebuffer(s.FRAMEBUFFER,b.__webglFramebuffer[ie]),b.__webglDepthbuffer[ie]===void 0)b.__webglDepthbuffer[ie]=s.createRenderbuffer(),ye(b.__webglDepthbuffer[ie],A,!1);else{let ne=A.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,Z=b.__webglDepthbuffer[ie];s.bindRenderbuffer(s.RENDERBUFFER,Z),s.framebufferRenderbuffer(s.FRAMEBUFFER,ne,s.RENDERBUFFER,Z)}}else if(t.bindFramebuffer(s.FRAMEBUFFER,b.__webglFramebuffer),b.__webglDepthbuffer===void 0)b.__webglDepthbuffer=s.createRenderbuffer(),ye(b.__webglDepthbuffer,A,!1);else{let ie=A.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,ne=b.__webglDepthbuffer;s.bindRenderbuffer(s.RENDERBUFFER,ne),s.framebufferRenderbuffer(s.FRAMEBUFFER,ie,s.RENDERBUFFER,ne)}t.bindFramebuffer(s.FRAMEBUFFER,null)}function Fe(A,b,W){let ie=n.get(A);b!==void 0&&Ae(ie.__webglFramebuffer,A,A.texture,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,0),W!==void 0&&qe(A)}function Ne(A){let b=A.texture,W=n.get(A),ie=n.get(b);A.addEventListener("dispose",w);let ne=A.textures,Z=A.isWebGLCubeRenderTarget===!0,xe=ne.length>1;if(xe||(ie.__webglTexture===void 0&&(ie.__webglTexture=s.createTexture()),ie.__version=b.version,o.memory.textures++),Z){W.__webglFramebuffer=[];for(let _e=0;_e<6;_e++)if(b.mipmaps&&b.mipmaps.length>0){W.__webglFramebuffer[_e]=[];for(let be=0;be<b.mipmaps.length;be++)W.__webglFramebuffer[_e][be]=s.createFramebuffer()}else W.__webglFramebuffer[_e]=s.createFramebuffer()}else{if(b.mipmaps&&b.mipmaps.length>0){W.__webglFramebuffer=[];for(let _e=0;_e<b.mipmaps.length;_e++)W.__webglFramebuffer[_e]=s.createFramebuffer()}else W.__webglFramebuffer=s.createFramebuffer();if(xe)for(let _e=0,be=ne.length;_e<be;_e++){let We=n.get(ne[_e]);We.__webglTexture===void 0&&(We.__webglTexture=s.createTexture(),o.memory.textures++)}if(A.samples>0&&ot(A)===!1){W.__webglMultisampledFramebuffer=s.createFramebuffer(),W.__webglColorRenderbuffer=[],t.bindFramebuffer(s.FRAMEBUFFER,W.__webglMultisampledFramebuffer);for(let _e=0;_e<ne.length;_e++){let be=ne[_e];W.__webglColorRenderbuffer[_e]=s.createRenderbuffer(),s.bindRenderbuffer(s.RENDERBUFFER,W.__webglColorRenderbuffer[_e]);let We=r.convert(be.format,be.colorSpace),le=r.convert(be.type),Ee=S(be.internalFormat,We,le,be.colorSpace,A.isXRRenderTarget===!0),Pe=rt(A);s.renderbufferStorageMultisample(s.RENDERBUFFER,Pe,Ee,A.width,A.height),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+_e,s.RENDERBUFFER,W.__webglColorRenderbuffer[_e])}s.bindRenderbuffer(s.RENDERBUFFER,null),A.depthBuffer&&(W.__webglDepthRenderbuffer=s.createRenderbuffer(),ye(W.__webglDepthRenderbuffer,A,!0)),t.bindFramebuffer(s.FRAMEBUFFER,null)}}if(Z){t.bindTexture(s.TEXTURE_CUBE_MAP,ie.__webglTexture),Ue(s.TEXTURE_CUBE_MAP,b);for(let _e=0;_e<6;_e++)if(b.mipmaps&&b.mipmaps.length>0)for(let be=0;be<b.mipmaps.length;be++)Ae(W.__webglFramebuffer[_e][be],A,b,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+_e,be);else Ae(W.__webglFramebuffer[_e],A,b,s.COLOR_ATTACHMENT0,s.TEXTURE_CUBE_MAP_POSITIVE_X+_e,0);m(b)&&f(s.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(xe){for(let _e=0,be=ne.length;_e<be;_e++){let We=ne[_e],le=n.get(We);t.bindTexture(s.TEXTURE_2D,le.__webglTexture),Ue(s.TEXTURE_2D,We),Ae(W.__webglFramebuffer,A,We,s.COLOR_ATTACHMENT0+_e,s.TEXTURE_2D,0),m(We)&&f(s.TEXTURE_2D)}t.unbindTexture()}else{let _e=s.TEXTURE_2D;if((A.isWebGL3DRenderTarget||A.isWebGLArrayRenderTarget)&&(_e=A.isWebGL3DRenderTarget?s.TEXTURE_3D:s.TEXTURE_2D_ARRAY),t.bindTexture(_e,ie.__webglTexture),Ue(_e,b),b.mipmaps&&b.mipmaps.length>0)for(let be=0;be<b.mipmaps.length;be++)Ae(W.__webglFramebuffer[be],A,b,s.COLOR_ATTACHMENT0,_e,be);else Ae(W.__webglFramebuffer,A,b,s.COLOR_ATTACHMENT0,_e,0);m(b)&&f(_e),t.unbindTexture()}A.depthBuffer&&qe(A)}function et(A){let b=A.textures;for(let W=0,ie=b.length;W<ie;W++){let ne=b[W];if(m(ne)){let Z=v(A),xe=n.get(ne).__webglTexture;t.bindTexture(Z,xe),f(Z),t.unbindTexture()}}}let Ke=[],L=[];function on(A){if(A.samples>0){if(ot(A)===!1){let b=A.textures,W=A.width,ie=A.height,ne=s.COLOR_BUFFER_BIT,Z=A.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT,xe=n.get(A),_e=b.length>1;if(_e)for(let be=0;be<b.length;be++)t.bindFramebuffer(s.FRAMEBUFFER,xe.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+be,s.RENDERBUFFER,null),t.bindFramebuffer(s.FRAMEBUFFER,xe.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+be,s.TEXTURE_2D,null,0);t.bindFramebuffer(s.READ_FRAMEBUFFER,xe.__webglMultisampledFramebuffer),t.bindFramebuffer(s.DRAW_FRAMEBUFFER,xe.__webglFramebuffer);for(let be=0;be<b.length;be++){if(A.resolveDepthBuffer&&(A.depthBuffer&&(ne|=s.DEPTH_BUFFER_BIT),A.stencilBuffer&&A.resolveStencilBuffer&&(ne|=s.STENCIL_BUFFER_BIT)),_e){s.framebufferRenderbuffer(s.READ_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.RENDERBUFFER,xe.__webglColorRenderbuffer[be]);let We=n.get(b[be]).__webglTexture;s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0,s.TEXTURE_2D,We,0)}s.blitFramebuffer(0,0,W,ie,0,0,W,ie,ne,s.NEAREST),c===!0&&(Ke.length=0,L.length=0,Ke.push(s.COLOR_ATTACHMENT0+be),A.depthBuffer&&A.resolveDepthBuffer===!1&&(Ke.push(Z),L.push(Z),s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,L)),s.invalidateFramebuffer(s.READ_FRAMEBUFFER,Ke))}if(t.bindFramebuffer(s.READ_FRAMEBUFFER,null),t.bindFramebuffer(s.DRAW_FRAMEBUFFER,null),_e)for(let be=0;be<b.length;be++){t.bindFramebuffer(s.FRAMEBUFFER,xe.__webglMultisampledFramebuffer),s.framebufferRenderbuffer(s.FRAMEBUFFER,s.COLOR_ATTACHMENT0+be,s.RENDERBUFFER,xe.__webglColorRenderbuffer[be]);let We=n.get(b[be]).__webglTexture;t.bindFramebuffer(s.FRAMEBUFFER,xe.__webglFramebuffer),s.framebufferTexture2D(s.DRAW_FRAMEBUFFER,s.COLOR_ATTACHMENT0+be,s.TEXTURE_2D,We,0)}t.bindFramebuffer(s.DRAW_FRAMEBUFFER,xe.__webglMultisampledFramebuffer)}else if(A.depthBuffer&&A.resolveDepthBuffer===!1&&c){let b=A.stencilBuffer?s.DEPTH_STENCIL_ATTACHMENT:s.DEPTH_ATTACHMENT;s.invalidateFramebuffer(s.DRAW_FRAMEBUFFER,[b])}}}function rt(A){return Math.min(i.maxSamples,A.samples)}function ot(A){let b=n.get(A);return A.samples>0&&e.has("WEBGL_multisampled_render_to_texture")===!0&&b.__useRenderToTexture!==!1}function ve(A){let b=o.render.frame;h.get(A)!==b&&(h.set(A,b),A.update())}function gt(A,b){let W=A.colorSpace,ie=A.format,ne=A.type;return A.isCompressedTexture===!0||A.isVideoTexture===!0||W!==Jt&&W!==Fi&&(ft.getTransfer(W)===At?(ie!==Pn||ne!==fi)&&console.warn("THREE.WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):console.error("THREE.WebGLTextures: Unsupported texture color space:",W)),b}function Ce(A){return typeof HTMLImageElement<"u"&&A instanceof HTMLImageElement?(l.width=A.naturalWidth||A.width,l.height=A.naturalHeight||A.height):typeof VideoFrame<"u"&&A instanceof VideoFrame?(l.width=A.displayWidth,l.height=A.displayHeight):(l.width=A.width,l.height=A.height),l}this.allocateTextureUnit=U,this.resetTextureUnits=F,this.setTexture2D=$,this.setTexture2DArray=k,this.setTexture3D=ee,this.setTextureCube=Y,this.rebindTextures=Fe,this.setupRenderTarget=Ne,this.updateRenderTargetMipmap=et,this.updateMultisampleRenderTarget=on,this.setupDepthRenderbuffer=qe,this.setupFrameBufferTexture=Ae,this.useMultisampledRTT=ot}function Zx(s,e){function t(n,i=Fi){let r,o=ft.getTransfer(i);if(n===fi)return s.UNSIGNED_BYTE;if(n===ka)return s.UNSIGNED_SHORT_4_4_4_4;if(n===Ga)return s.UNSIGNED_SHORT_5_5_5_1;if(n===Dl)return s.UNSIGNED_INT_5_9_9_9_REV;if(n===Pl)return s.BYTE;if(n===Ll)return s.SHORT;if(n===gr)return s.UNSIGNED_SHORT;if(n===Ha)return s.INT;if(n===es)return s.UNSIGNED_INT;if(n===gn)return s.FLOAT;if(n===Qn)return s.HALF_FLOAT;if(n===Ul)return s.ALPHA;if(n===Nl)return s.RGB;if(n===Pn)return s.RGBA;if(n===Fl)return s.LUMINANCE;if(n===Bl)return s.LUMINANCE_ALPHA;if(n===us)return s.DEPTH_COMPONENT;if(n===ps)return s.DEPTH_STENCIL;if(n===Va)return s.RED;if(n===Wa)return s.RED_INTEGER;if(n===Ol)return s.RG;if(n===Xa)return s.RG_INTEGER;if(n===Ya)return s.RGBA_INTEGER;if(n===vo||n===Mo||n===bo||n===So)if(o===At)if(r=e.get("WEBGL_compressed_texture_s3tc_srgb"),r!==null){if(n===vo)return r.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(n===Mo)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(n===bo)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(n===So)return r.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(r=e.get("WEBGL_compressed_texture_s3tc"),r!==null){if(n===vo)return r.COMPRESSED_RGB_S3TC_DXT1_EXT;if(n===Mo)return r.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(n===bo)return r.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(n===So)return r.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(n===qa||n===Za||n===Ka||n===Ja)if(r=e.get("WEBGL_compressed_texture_pvrtc"),r!==null){if(n===qa)return r.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(n===Za)return r.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(n===Ka)return r.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(n===Ja)return r.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(n===$a||n===ja||n===Qa)if(r=e.get("WEBGL_compressed_texture_etc"),r!==null){if(n===$a||n===ja)return o===At?r.COMPRESSED_SRGB8_ETC2:r.COMPRESSED_RGB8_ETC2;if(n===Qa)return o===At?r.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:r.COMPRESSED_RGBA8_ETC2_EAC}else return null;if(n===ec||n===tc||n===nc||n===ic||n===sc||n===rc||n===oc||n===ac||n===cc||n===lc||n===hc||n===uc||n===dc||n===fc)if(r=e.get("WEBGL_compressed_texture_astc"),r!==null){if(n===ec)return o===At?r.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:r.COMPRESSED_RGBA_ASTC_4x4_KHR;if(n===tc)return o===At?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:r.COMPRESSED_RGBA_ASTC_5x4_KHR;if(n===nc)return o===At?r.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:r.COMPRESSED_RGBA_ASTC_5x5_KHR;if(n===ic)return o===At?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:r.COMPRESSED_RGBA_ASTC_6x5_KHR;if(n===sc)return o===At?r.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:r.COMPRESSED_RGBA_ASTC_6x6_KHR;if(n===rc)return o===At?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:r.COMPRESSED_RGBA_ASTC_8x5_KHR;if(n===oc)return o===At?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:r.COMPRESSED_RGBA_ASTC_8x6_KHR;if(n===ac)return o===At?r.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:r.COMPRESSED_RGBA_ASTC_8x8_KHR;if(n===cc)return o===At?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:r.COMPRESSED_RGBA_ASTC_10x5_KHR;if(n===lc)return o===At?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:r.COMPRESSED_RGBA_ASTC_10x6_KHR;if(n===hc)return o===At?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:r.COMPRESSED_RGBA_ASTC_10x8_KHR;if(n===uc)return o===At?r.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:r.COMPRESSED_RGBA_ASTC_10x10_KHR;if(n===dc)return o===At?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:r.COMPRESSED_RGBA_ASTC_12x10_KHR;if(n===fc)return o===At?r.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:r.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(n===Eo||n===pc||n===mc)if(r=e.get("EXT_texture_compression_bptc"),r!==null){if(n===Eo)return o===At?r.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:r.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(n===pc)return r.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(n===mc)return r.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(n===zl||n===gc||n===_c||n===xc)if(r=e.get("EXT_texture_compression_rgtc"),r!==null){if(n===Eo)return r.COMPRESSED_RED_RGTC1_EXT;if(n===gc)return r.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(n===_c)return r.COMPRESSED_RED_GREEN_RGTC2_EXT;if(n===xc)return r.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return n===Us?s.UNSIGNED_INT_24_8:s[n]!==void 0?s[n]:null}return{convert:t}}var Kx=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,Jx=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`,lh=class{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(e,t,n){if(this.texture===null){let i=new $t,r=e.properties.get(i);r.__webglTexture=t.texture,(t.depthNear!==n.depthNear||t.depthFar!==n.depthFar)&&(this.depthNear=t.depthNear,this.depthFar=t.depthFar),this.texture=i}}getMesh(e){if(this.texture!==null&&this.mesh===null){let t=e.cameras[0].viewport,n=new Jn({vertexShader:Kx,fragmentShader:Jx,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new we(new jt(20,20),n)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}},hh=class extends Ri{constructor(e,t){super();let n=this,i=null,r=1,o=null,a="local-floor",c=1,l=null,h=null,u=null,d=null,p=null,g=null,_=new lh,m=t.getContextAttributes(),f=null,v=null,S=[],x=[],P=new ke,T=null,w=new Yt;w.viewport=new _t;let R=new Yt;R.viewport=new _t;let M=[w,R],y=new Ra,I=null,F=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(te){let ue=S[te];return ue===void 0&&(ue=new ur,S[te]=ue),ue.getTargetRaySpace()},this.getControllerGrip=function(te){let ue=S[te];return ue===void 0&&(ue=new ur,S[te]=ue),ue.getGripSpace()},this.getHand=function(te){let ue=S[te];return ue===void 0&&(ue=new ur,S[te]=ue),ue.getHandSpace()};function U(te){let ue=x.indexOf(te.inputSource);if(ue===-1)return;let Ae=S[ue];Ae!==void 0&&(Ae.update(te.inputSource,te.frame,l||o),Ae.dispatchEvent({type:te.type,data:te.inputSource}))}function O(){i.removeEventListener("select",U),i.removeEventListener("selectstart",U),i.removeEventListener("selectend",U),i.removeEventListener("squeeze",U),i.removeEventListener("squeezestart",U),i.removeEventListener("squeezeend",U),i.removeEventListener("end",O),i.removeEventListener("inputsourceschange",$);for(let te=0;te<S.length;te++){let ue=x[te];ue!==null&&(x[te]=null,S[te].disconnect(ue))}I=null,F=null,_.reset(),e.setRenderTarget(f),p=null,d=null,u=null,i=null,v=null,Ge.stop(),n.isPresenting=!1,e.setPixelRatio(T),e.setSize(P.width,P.height,!1),n.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(te){r=te,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(te){a=te,n.isPresenting===!0&&console.warn("THREE.WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return l||o},this.setReferenceSpace=function(te){l=te},this.getBaseLayer=function(){return d!==null?d:p},this.getBinding=function(){return u},this.getFrame=function(){return g},this.getSession=function(){return i},this.setSession=async function(te){if(i=te,i!==null){if(f=e.getRenderTarget(),i.addEventListener("select",U),i.addEventListener("selectstart",U),i.addEventListener("selectend",U),i.addEventListener("squeeze",U),i.addEventListener("squeezestart",U),i.addEventListener("squeezeend",U),i.addEventListener("end",O),i.addEventListener("inputsourceschange",$),m.xrCompatible!==!0&&await t.makeXRCompatible(),T=e.getPixelRatio(),e.getSize(P),typeof XRWebGLBinding<"u"&&"createProjectionLayer"in XRWebGLBinding.prototype){let Ae=null,ye=null,Be=null;m.depth&&(Be=m.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,Ae=m.stencil?ps:us,ye=m.stencil?Us:es);let qe={colorFormat:t.RGBA8,depthFormat:Be,scaleFactor:r};u=new XRWebGLBinding(i,t),d=u.createProjectionLayer(qe),i.updateRenderState({layers:[d]}),e.setPixelRatio(1),e.setSize(d.textureWidth,d.textureHeight,!1),v=new ai(d.textureWidth,d.textureHeight,{format:Pn,type:fi,depthTexture:new so(d.textureWidth,d.textureHeight,ye,void 0,void 0,void 0,void 0,void 0,void 0,Ae),stencilBuffer:m.stencil,colorSpace:e.outputColorSpace,samples:m.antialias?4:0,resolveDepthBuffer:d.ignoreDepthValues===!1,resolveStencilBuffer:d.ignoreDepthValues===!1})}else{let Ae={antialias:m.antialias,alpha:!0,depth:m.depth,stencil:m.stencil,framebufferScaleFactor:r};p=new XRWebGLLayer(i,t,Ae),i.updateRenderState({baseLayer:p}),e.setPixelRatio(1),e.setSize(p.framebufferWidth,p.framebufferHeight,!1),v=new ai(p.framebufferWidth,p.framebufferHeight,{format:Pn,type:fi,colorSpace:e.outputColorSpace,stencilBuffer:m.stencil,resolveDepthBuffer:p.ignoreDepthValues===!1,resolveStencilBuffer:p.ignoreDepthValues===!1})}v.isXRRenderTarget=!0,this.setFoveation(c),l=null,o=await i.requestReferenceSpace(a),Ge.setContext(i),Ge.start(),n.isPresenting=!0,n.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(i!==null)return i.environmentBlendMode},this.getDepthTexture=function(){return _.getDepthTexture()};function $(te){for(let ue=0;ue<te.removed.length;ue++){let Ae=te.removed[ue],ye=x.indexOf(Ae);ye>=0&&(x[ye]=null,S[ye].disconnect(Ae))}for(let ue=0;ue<te.added.length;ue++){let Ae=te.added[ue],ye=x.indexOf(Ae);if(ye===-1){for(let qe=0;qe<S.length;qe++)if(qe>=x.length){x.push(Ae),ye=qe;break}else if(x[qe]===null){x[qe]=Ae,ye=qe;break}if(ye===-1)break}let Be=S[ye];Be&&Be.connect(Ae)}}let k=new D,ee=new D;function Y(te,ue,Ae){k.setFromMatrixPosition(ue.matrixWorld),ee.setFromMatrixPosition(Ae.matrixWorld);let ye=k.distanceTo(ee),Be=ue.projectionMatrix.elements,qe=Ae.projectionMatrix.elements,Fe=Be[14]/(Be[10]-1),Ne=Be[14]/(Be[10]+1),et=(Be[9]+1)/Be[5],Ke=(Be[9]-1)/Be[5],L=(Be[8]-1)/Be[0],on=(qe[8]+1)/qe[0],rt=Fe*L,ot=Fe*on,ve=ye/(-L+on),gt=ve*-L;if(ue.matrixWorld.decompose(te.position,te.quaternion,te.scale),te.translateX(gt),te.translateZ(ve),te.matrixWorld.compose(te.position,te.quaternion,te.scale),te.matrixWorldInverse.copy(te.matrixWorld).invert(),Be[10]===-1)te.projectionMatrix.copy(ue.projectionMatrix),te.projectionMatrixInverse.copy(ue.projectionMatrixInverse);else{let Ce=Fe+ve,A=Ne+ve,b=rt-gt,W=ot+(ye-gt),ie=et*Ne/A*Ce,ne=Ke*Ne/A*Ce;te.projectionMatrix.makePerspective(b,W,ie,ne,Ce,A),te.projectionMatrixInverse.copy(te.projectionMatrix).invert()}}function ce(te,ue){ue===null?te.matrixWorld.copy(te.matrix):te.matrixWorld.multiplyMatrices(ue.matrixWorld,te.matrix),te.matrixWorldInverse.copy(te.matrixWorld).invert()}this.updateCamera=function(te){if(i===null)return;let ue=te.near,Ae=te.far;_.texture!==null&&(_.depthNear>0&&(ue=_.depthNear),_.depthFar>0&&(Ae=_.depthFar)),y.near=R.near=w.near=ue,y.far=R.far=w.far=Ae,(I!==y.near||F!==y.far)&&(i.updateRenderState({depthNear:y.near,depthFar:y.far}),I=y.near,F=y.far),w.layers.mask=te.layers.mask|2,R.layers.mask=te.layers.mask|4,y.layers.mask=w.layers.mask|R.layers.mask;let ye=te.parent,Be=y.cameras;ce(y,ye);for(let qe=0;qe<Be.length;qe++)ce(Be[qe],ye);Be.length===2?Y(y,w,R):y.projectionMatrix.copy(w.projectionMatrix),pe(te,y,ye)};function pe(te,ue,Ae){Ae===null?te.matrix.copy(ue.matrixWorld):(te.matrix.copy(Ae.matrixWorld),te.matrix.invert(),te.matrix.multiply(ue.matrixWorld)),te.matrix.decompose(te.position,te.quaternion,te.scale),te.updateMatrixWorld(!0),te.projectionMatrix.copy(ue.projectionMatrix),te.projectionMatrixInverse.copy(ue.projectionMatrixInverse),te.isPerspectiveCamera&&(te.fov=_s*2*Math.atan(1/te.projectionMatrix.elements[5]),te.zoom=1)}this.getCamera=function(){return y},this.getFoveation=function(){if(!(d===null&&p===null))return c},this.setFoveation=function(te){c=te,d!==null&&(d.fixedFoveation=te),p!==null&&p.fixedFoveation!==void 0&&(p.fixedFoveation=te)},this.hasDepthSensing=function(){return _.texture!==null},this.getDepthSensingMesh=function(){return _.getMesh(y)};let Ie=null;function Ue(te,ue){if(h=ue.getViewerPose(l||o),g=ue,h!==null){let Ae=h.views;p!==null&&(e.setRenderTargetFramebuffer(v,p.framebuffer),e.setRenderTarget(v));let ye=!1;Ae.length!==y.cameras.length&&(y.cameras.length=0,ye=!0);for(let Fe=0;Fe<Ae.length;Fe++){let Ne=Ae[Fe],et=null;if(p!==null)et=p.getViewport(Ne);else{let L=u.getViewSubImage(d,Ne);et=L.viewport,Fe===0&&(e.setRenderTargetTextures(v,L.colorTexture,d.ignoreDepthValues?void 0:L.depthStencilTexture),e.setRenderTarget(v))}let Ke=M[Fe];Ke===void 0&&(Ke=new Yt,Ke.layers.enable(Fe),Ke.viewport=new _t,M[Fe]=Ke),Ke.matrix.fromArray(Ne.transform.matrix),Ke.matrix.decompose(Ke.position,Ke.quaternion,Ke.scale),Ke.projectionMatrix.fromArray(Ne.projectionMatrix),Ke.projectionMatrixInverse.copy(Ke.projectionMatrix).invert(),Ke.viewport.set(et.x,et.y,et.width,et.height),Fe===0&&(y.matrix.copy(Ke.matrix),y.matrix.decompose(y.position,y.quaternion,y.scale)),ye===!0&&y.cameras.push(Ke)}let Be=i.enabledFeatures;if(Be&&Be.includes("depth-sensing")&&i.depthUsage=="gpu-optimized"&&u){let Fe=u.getDepthInformation(Ae[0]);Fe&&Fe.isValid&&Fe.texture&&_.init(e,Fe,i.renderState)}}for(let Ae=0;Ae<S.length;Ae++){let ye=x[Ae],Be=S[Ae];ye!==null&&Be!==void 0&&Be.update(ye,ue,l||o)}Ie&&Ie(te,ue),ue.detectedPlanes&&n.dispatchEvent({type:"planesdetected",data:ue}),g=null}let Ge=new df;Ge.setAnimationLoop(Ue),this.setAnimationLoop=function(te){Ie=te},this.dispose=function(){}}},Bs=new Kn,$x=new Ze;function jx(s,e){function t(m,f){m.matrixAutoUpdate===!0&&m.updateMatrix(),f.value.copy(m.matrix)}function n(m,f){f.color.getRGB(m.fogColor.value,ql(s)),f.isFog?(m.fogNear.value=f.near,m.fogFar.value=f.far):f.isFogExp2&&(m.fogDensity.value=f.density)}function i(m,f,v,S,x){f.isMeshBasicMaterial||f.isMeshLambertMaterial?r(m,f):f.isMeshToonMaterial?(r(m,f),u(m,f)):f.isMeshPhongMaterial?(r(m,f),h(m,f)):f.isMeshStandardMaterial?(r(m,f),d(m,f),f.isMeshPhysicalMaterial&&p(m,f,x)):f.isMeshMatcapMaterial?(r(m,f),g(m,f)):f.isMeshDepthMaterial?r(m,f):f.isMeshDistanceMaterial?(r(m,f),_(m,f)):f.isMeshNormalMaterial?r(m,f):f.isLineBasicMaterial?(o(m,f),f.isLineDashedMaterial&&a(m,f)):f.isPointsMaterial?c(m,f,v,S):f.isSpriteMaterial?l(m,f):f.isShadowMaterial?(m.color.value.copy(f.color),m.opacity.value=f.opacity):f.isShaderMaterial&&(f.uniformsNeedUpdate=!1)}function r(m,f){m.opacity.value=f.opacity,f.color&&m.diffuse.value.copy(f.color),f.emissive&&m.emissive.value.copy(f.emissive).multiplyScalar(f.emissiveIntensity),f.map&&(m.map.value=f.map,t(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,t(f.alphaMap,m.alphaMapTransform)),f.bumpMap&&(m.bumpMap.value=f.bumpMap,t(f.bumpMap,m.bumpMapTransform),m.bumpScale.value=f.bumpScale,f.side===Vt&&(m.bumpScale.value*=-1)),f.normalMap&&(m.normalMap.value=f.normalMap,t(f.normalMap,m.normalMapTransform),m.normalScale.value.copy(f.normalScale),f.side===Vt&&m.normalScale.value.negate()),f.displacementMap&&(m.displacementMap.value=f.displacementMap,t(f.displacementMap,m.displacementMapTransform),m.displacementScale.value=f.displacementScale,m.displacementBias.value=f.displacementBias),f.emissiveMap&&(m.emissiveMap.value=f.emissiveMap,t(f.emissiveMap,m.emissiveMapTransform)),f.specularMap&&(m.specularMap.value=f.specularMap,t(f.specularMap,m.specularMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest);let v=e.get(f),S=v.envMap,x=v.envMapRotation;S&&(m.envMap.value=S,Bs.copy(x),Bs.x*=-1,Bs.y*=-1,Bs.z*=-1,S.isCubeTexture&&S.isRenderTargetTexture===!1&&(Bs.y*=-1,Bs.z*=-1),m.envMapRotation.value.setFromMatrix4($x.makeRotationFromEuler(Bs)),m.flipEnvMap.value=S.isCubeTexture&&S.isRenderTargetTexture===!1?-1:1,m.reflectivity.value=f.reflectivity,m.ior.value=f.ior,m.refractionRatio.value=f.refractionRatio),f.lightMap&&(m.lightMap.value=f.lightMap,m.lightMapIntensity.value=f.lightMapIntensity,t(f.lightMap,m.lightMapTransform)),f.aoMap&&(m.aoMap.value=f.aoMap,m.aoMapIntensity.value=f.aoMapIntensity,t(f.aoMap,m.aoMapTransform))}function o(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,f.map&&(m.map.value=f.map,t(f.map,m.mapTransform))}function a(m,f){m.dashSize.value=f.dashSize,m.totalSize.value=f.dashSize+f.gapSize,m.scale.value=f.scale}function c(m,f,v,S){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.size.value=f.size*v,m.scale.value=S*.5,f.map&&(m.map.value=f.map,t(f.map,m.uvTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,t(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function l(m,f){m.diffuse.value.copy(f.color),m.opacity.value=f.opacity,m.rotation.value=f.rotation,f.map&&(m.map.value=f.map,t(f.map,m.mapTransform)),f.alphaMap&&(m.alphaMap.value=f.alphaMap,t(f.alphaMap,m.alphaMapTransform)),f.alphaTest>0&&(m.alphaTest.value=f.alphaTest)}function h(m,f){m.specular.value.copy(f.specular),m.shininess.value=Math.max(f.shininess,1e-4)}function u(m,f){f.gradientMap&&(m.gradientMap.value=f.gradientMap)}function d(m,f){m.metalness.value=f.metalness,f.metalnessMap&&(m.metalnessMap.value=f.metalnessMap,t(f.metalnessMap,m.metalnessMapTransform)),m.roughness.value=f.roughness,f.roughnessMap&&(m.roughnessMap.value=f.roughnessMap,t(f.roughnessMap,m.roughnessMapTransform)),f.envMap&&(m.envMapIntensity.value=f.envMapIntensity)}function p(m,f,v){m.ior.value=f.ior,f.sheen>0&&(m.sheenColor.value.copy(f.sheenColor).multiplyScalar(f.sheen),m.sheenRoughness.value=f.sheenRoughness,f.sheenColorMap&&(m.sheenColorMap.value=f.sheenColorMap,t(f.sheenColorMap,m.sheenColorMapTransform)),f.sheenRoughnessMap&&(m.sheenRoughnessMap.value=f.sheenRoughnessMap,t(f.sheenRoughnessMap,m.sheenRoughnessMapTransform))),f.clearcoat>0&&(m.clearcoat.value=f.clearcoat,m.clearcoatRoughness.value=f.clearcoatRoughness,f.clearcoatMap&&(m.clearcoatMap.value=f.clearcoatMap,t(f.clearcoatMap,m.clearcoatMapTransform)),f.clearcoatRoughnessMap&&(m.clearcoatRoughnessMap.value=f.clearcoatRoughnessMap,t(f.clearcoatRoughnessMap,m.clearcoatRoughnessMapTransform)),f.clearcoatNormalMap&&(m.clearcoatNormalMap.value=f.clearcoatNormalMap,t(f.clearcoatNormalMap,m.clearcoatNormalMapTransform),m.clearcoatNormalScale.value.copy(f.clearcoatNormalScale),f.side===Vt&&m.clearcoatNormalScale.value.negate())),f.dispersion>0&&(m.dispersion.value=f.dispersion),f.iridescence>0&&(m.iridescence.value=f.iridescence,m.iridescenceIOR.value=f.iridescenceIOR,m.iridescenceThicknessMinimum.value=f.iridescenceThicknessRange[0],m.iridescenceThicknessMaximum.value=f.iridescenceThicknessRange[1],f.iridescenceMap&&(m.iridescenceMap.value=f.iridescenceMap,t(f.iridescenceMap,m.iridescenceMapTransform)),f.iridescenceThicknessMap&&(m.iridescenceThicknessMap.value=f.iridescenceThicknessMap,t(f.iridescenceThicknessMap,m.iridescenceThicknessMapTransform))),f.transmission>0&&(m.transmission.value=f.transmission,m.transmissionSamplerMap.value=v.texture,m.transmissionSamplerSize.value.set(v.width,v.height),f.transmissionMap&&(m.transmissionMap.value=f.transmissionMap,t(f.transmissionMap,m.transmissionMapTransform)),m.thickness.value=f.thickness,f.thicknessMap&&(m.thicknessMap.value=f.thicknessMap,t(f.thicknessMap,m.thicknessMapTransform)),m.attenuationDistance.value=f.attenuationDistance,m.attenuationColor.value.copy(f.attenuationColor)),f.anisotropy>0&&(m.anisotropyVector.value.set(f.anisotropy*Math.cos(f.anisotropyRotation),f.anisotropy*Math.sin(f.anisotropyRotation)),f.anisotropyMap&&(m.anisotropyMap.value=f.anisotropyMap,t(f.anisotropyMap,m.anisotropyMapTransform))),m.specularIntensity.value=f.specularIntensity,m.specularColor.value.copy(f.specularColor),f.specularColorMap&&(m.specularColorMap.value=f.specularColorMap,t(f.specularColorMap,m.specularColorMapTransform)),f.specularIntensityMap&&(m.specularIntensityMap.value=f.specularIntensityMap,t(f.specularIntensityMap,m.specularIntensityMapTransform))}function g(m,f){f.matcap&&(m.matcap.value=f.matcap)}function _(m,f){let v=e.get(f).light;m.referencePosition.value.setFromMatrixPosition(v.matrixWorld),m.nearDistance.value=v.shadow.camera.near,m.farDistance.value=v.shadow.camera.far}return{refreshFogUniforms:n,refreshMaterialUniforms:i}}function Qx(s,e,t,n){let i={},r={},o=[],a=s.getParameter(s.MAX_UNIFORM_BUFFER_BINDINGS);function c(v,S){let x=S.program;n.uniformBlockBinding(v,x)}function l(v,S){let x=i[v.id];x===void 0&&(g(v),x=h(v),i[v.id]=x,v.addEventListener("dispose",m));let P=S.program;n.updateUBOMapping(v,P);let T=e.render.frame;r[v.id]!==T&&(d(v),r[v.id]=T)}function h(v){let S=u();v.__bindingPointIndex=S;let x=s.createBuffer(),P=v.__size,T=v.usage;return s.bindBuffer(s.UNIFORM_BUFFER,x),s.bufferData(s.UNIFORM_BUFFER,P,T),s.bindBuffer(s.UNIFORM_BUFFER,null),s.bindBufferBase(s.UNIFORM_BUFFER,S,x),x}function u(){for(let v=0;v<a;v++)if(o.indexOf(v)===-1)return o.push(v),v;return console.error("THREE.WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function d(v){let S=i[v.id],x=v.uniforms,P=v.__cache;s.bindBuffer(s.UNIFORM_BUFFER,S);for(let T=0,w=x.length;T<w;T++){let R=Array.isArray(x[T])?x[T]:[x[T]];for(let M=0,y=R.length;M<y;M++){let I=R[M];if(p(I,T,M,P)===!0){let F=I.__offset,U=Array.isArray(I.value)?I.value:[I.value],O=0;for(let $=0;$<U.length;$++){let k=U[$],ee=_(k);typeof k=="number"||typeof k=="boolean"?(I.__data[0]=k,s.bufferSubData(s.UNIFORM_BUFFER,F+O,I.__data)):k.isMatrix3?(I.__data[0]=k.elements[0],I.__data[1]=k.elements[1],I.__data[2]=k.elements[2],I.__data[3]=0,I.__data[4]=k.elements[3],I.__data[5]=k.elements[4],I.__data[6]=k.elements[5],I.__data[7]=0,I.__data[8]=k.elements[6],I.__data[9]=k.elements[7],I.__data[10]=k.elements[8],I.__data[11]=0):(k.toArray(I.__data,O),O+=ee.storage/Float32Array.BYTES_PER_ELEMENT)}s.bufferSubData(s.UNIFORM_BUFFER,F,I.__data)}}}s.bindBuffer(s.UNIFORM_BUFFER,null)}function p(v,S,x,P){let T=v.value,w=S+"_"+x;if(P[w]===void 0)return typeof T=="number"||typeof T=="boolean"?P[w]=T:P[w]=T.clone(),!0;{let R=P[w];if(typeof T=="number"||typeof T=="boolean"){if(R!==T)return P[w]=T,!0}else if(R.equals(T)===!1)return R.copy(T),!0}return!1}function g(v){let S=v.uniforms,x=0,P=16;for(let w=0,R=S.length;w<R;w++){let M=Array.isArray(S[w])?S[w]:[S[w]];for(let y=0,I=M.length;y<I;y++){let F=M[y],U=Array.isArray(F.value)?F.value:[F.value];for(let O=0,$=U.length;O<$;O++){let k=U[O],ee=_(k),Y=x%P,ce=Y%ee.boundary,pe=Y+ce;x+=ce,pe!==0&&P-pe<ee.storage&&(x+=P-pe),F.__data=new Float32Array(ee.storage/Float32Array.BYTES_PER_ELEMENT),F.__offset=x,x+=ee.storage}}}let T=x%P;return T>0&&(x+=P-T),v.__size=x,v.__cache={},this}function _(v){let S={boundary:0,storage:0};return typeof v=="number"||typeof v=="boolean"?(S.boundary=4,S.storage=4):v.isVector2?(S.boundary=8,S.storage=8):v.isVector3||v.isColor?(S.boundary=16,S.storage=12):v.isVector4?(S.boundary=16,S.storage=16):v.isMatrix3?(S.boundary=48,S.storage=48):v.isMatrix4?(S.boundary=64,S.storage=64):v.isTexture?console.warn("THREE.WebGLRenderer: Texture samplers can not be part of an uniforms group."):console.warn("THREE.WebGLRenderer: Unsupported uniform value type.",v),S}function m(v){let S=v.target;S.removeEventListener("dispose",m);let x=o.indexOf(S.__bindingPointIndex);o.splice(x,1),s.deleteBuffer(i[S.id]),delete i[S.id],delete r[S.id]}function f(){for(let v in i)s.deleteBuffer(i[v]);o=[],i={},r={}}return{bind:c,update:l,dispose:f}}var bc=class{constructor(e={}){let{canvas:t=Dd(),context:n=null,depth:i=!0,stencil:r=!1,alpha:o=!1,antialias:a=!1,premultipliedAlpha:c=!0,preserveDrawingBuffer:l=!1,powerPreference:h="default",failIfMajorPerformanceCaveat:u=!1,reverseDepthBuffer:d=!1}=e;this.isWebGLRenderer=!0;let p;if(n!==null){if(typeof WebGLRenderingContext<"u"&&n instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");p=n.getContextAttributes().alpha}else p=o;let g=new Uint32Array(4),_=new Int32Array(4),m=null,f=null,v=[],S=[];this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this._outputColorSpace=ct,this.toneMapping=Ni,this.toneMappingExposure=1;let x=this,P=!1,T=0,w=0,R=null,M=-1,y=null,I=new _t,F=new _t,U=null,O=new ge(0),$=0,k=t.width,ee=t.height,Y=1,ce=null,pe=null,Ie=new _t(0,0,k,ee),Ue=new _t(0,0,k,ee),Ge=!1,te=new fr,ue=!1,Ae=!1;this.transmissionResolutionScale=1;let ye=new Ze,Be=new Ze,qe=new D,Fe=new _t,Ne={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0},et=!1;function Ke(){return R===null?Y:1}let L=n;function on(E,B){return t.getContext(E,B)}try{let E={alpha:!0,depth:i,stencil:r,antialias:a,premultipliedAlpha:c,preserveDrawingBuffer:l,powerPreference:h,failIfMajorPerformanceCaveat:u};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${"174"}`),t.addEventListener("webglcontextlost",se,!1),t.addEventListener("webglcontextrestored",fe,!1),t.addEventListener("webglcontextcreationerror",me,!1),L===null){let B="webgl2";if(L=on(B,E),L===null)throw on(B)?new Error("Error creating WebGL context with your selected attributes."):new Error("Error creating WebGL context.")}}catch(E){throw console.error("THREE.WebGLRenderer: "+E.message),E}let rt,ot,ve,gt,Ce,A,b,W,ie,ne,Z,xe,_e,be,We,le,Ee,Pe,Oe,Se,tt,ze,mt,N;function de(){rt=new __(L),rt.init(),ze=new Zx(L,rt),ot=new h_(L,rt,e,ze),ve=new Yx(L,rt),ot.reverseDepthBuffer&&d&&ve.buffers.depth.setReversed(!0),gt=new v_(L),Ce=new Dx,A=new qx(L,rt,ve,Ce,ot,ze,gt),b=new d_(x),W=new g_(x),ie=new Am(L),mt=new c_(L,ie),ne=new x_(L,ie,gt,mt),Z=new b_(L,ne,ie,gt),Oe=new M_(L,ot,A),le=new u_(Ce),xe=new Lx(x,b,W,rt,ot,mt,le),_e=new jx(x,Ce),be=new Nx,We=new kx(rt),Pe=new a_(x,b,W,ve,Z,p,c),Ee=new Wx(x,Z,ot),N=new Qx(L,gt,ot,ve),Se=new l_(L,rt,gt),tt=new y_(L,rt,gt),gt.programs=xe.programs,x.capabilities=ot,x.extensions=rt,x.properties=Ce,x.renderLists=be,x.shadowMap=Ee,x.state=ve,x.info=gt}de();let j=new hh(x,L);this.xr=j,this.getContext=function(){return L},this.getContextAttributes=function(){return L.getContextAttributes()},this.forceContextLoss=function(){let E=rt.get("WEBGL_lose_context");E&&E.loseContext()},this.forceContextRestore=function(){let E=rt.get("WEBGL_lose_context");E&&E.restoreContext()},this.getPixelRatio=function(){return Y},this.setPixelRatio=function(E){E!==void 0&&(Y=E,this.setSize(k,ee,!1))},this.getSize=function(E){return E.set(k,ee)},this.setSize=function(E,B,X=!0){if(j.isPresenting){console.warn("THREE.WebGLRenderer: Can't change size while VR device is presenting.");return}k=E,ee=B,t.width=Math.floor(E*Y),t.height=Math.floor(B*Y),X===!0&&(t.style.width=E+"px",t.style.height=B+"px"),this.setViewport(0,0,E,B)},this.getDrawingBufferSize=function(E){return E.set(k*Y,ee*Y).floor()},this.setDrawingBufferSize=function(E,B,X){k=E,ee=B,Y=X,t.width=Math.floor(E*X),t.height=Math.floor(B*X),this.setViewport(0,0,E,B)},this.getCurrentViewport=function(E){return E.copy(I)},this.getViewport=function(E){return E.copy(Ie)},this.setViewport=function(E,B,X,K){E.isVector4?Ie.set(E.x,E.y,E.z,E.w):Ie.set(E,B,X,K),ve.viewport(I.copy(Ie).multiplyScalar(Y).round())},this.getScissor=function(E){return E.copy(Ue)},this.setScissor=function(E,B,X,K){E.isVector4?Ue.set(E.x,E.y,E.z,E.w):Ue.set(E,B,X,K),ve.scissor(F.copy(Ue).multiplyScalar(Y).round())},this.getScissorTest=function(){return Ge},this.setScissorTest=function(E){ve.setScissorTest(Ge=E)},this.setOpaqueSort=function(E){ce=E},this.setTransparentSort=function(E){pe=E},this.getClearColor=function(E){return E.copy(Pe.getClearColor())},this.setClearColor=function(){Pe.setClearColor(...arguments)},this.getClearAlpha=function(){return Pe.getClearAlpha()},this.setClearAlpha=function(){Pe.setClearAlpha(...arguments)},this.clear=function(E=!0,B=!0,X=!0){let K=0;if(E){let H=!1;if(R!==null){let C=R.texture.format;H=C===Ya||C===Xa||C===Wa}if(H){let C=R.texture.type,G=C===fi||C===es||C===gr||C===Us||C===ka||C===Ga,V=Pe.getClearColor(),J=Pe.getClearAlpha(),Q=V.r,ae=V.g,q=V.b;G?(g[0]=Q,g[1]=ae,g[2]=q,g[3]=J,L.clearBufferuiv(L.COLOR,0,g)):(_[0]=Q,_[1]=ae,_[2]=q,_[3]=J,L.clearBufferiv(L.COLOR,0,_))}else K|=L.COLOR_BUFFER_BIT}B&&(K|=L.DEPTH_BUFFER_BIT),X&&(K|=L.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),L.clear(K)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.dispose=function(){t.removeEventListener("webglcontextlost",se,!1),t.removeEventListener("webglcontextrestored",fe,!1),t.removeEventListener("webglcontextcreationerror",me,!1),Pe.dispose(),be.dispose(),We.dispose(),Ce.dispose(),b.dispose(),W.dispose(),Z.dispose(),mt.dispose(),N.dispose(),xe.dispose(),j.dispose(),j.removeEventListener("sessionstart",xn),j.removeEventListener("sessionend",hn),qt.stop()};function se(E){E.preventDefault(),console.log("THREE.WebGLRenderer: Context Lost."),P=!0}function fe(){console.log("THREE.WebGLRenderer: Context Restored."),P=!1;let E=gt.autoReset,B=Ee.enabled,X=Ee.autoUpdate,K=Ee.needsUpdate,H=Ee.type;de(),gt.autoReset=E,Ee.enabled=B,Ee.autoUpdate=X,Ee.needsUpdate=K,Ee.type=H}function me(E){console.error("THREE.WebGLRenderer: A WebGL context could not be created. Reason: ",E.statusMessage)}function He(E){let B=E.target;B.removeEventListener("dispose",He),Et(B)}function Et(E){Ct(E),Ce.remove(E)}function Ct(E){let B=Ce.get(E).programs;B!==void 0&&(B.forEach(function(X){xe.releaseProgram(X)}),E.isShaderMaterial&&xe.releaseShaderCache(E))}this.renderBufferDirect=function(E,B,X,K,H,C){B===null&&(B=Ne);let G=H.isMesh&&H.matrixWorld.determinant()<0,V=ti(E,B,X,K,H);ve.setMaterial(K,G);let J=X.index,Q=1;if(K.wireframe===!0){if(J=ne.getWireframeAttribute(X),J===void 0)return;Q=2}let ae=X.drawRange,q=X.attributes.position,Te=ae.start*Q,Re=(ae.start+ae.count)*Q;C!==null&&(Te=Math.max(Te,C.start*Q),Re=Math.min(Re,(C.start+C.count)*Q)),J!==null?(Te=Math.max(Te,0),Re=Math.min(Re,J.count)):q!=null&&(Te=Math.max(Te,0),Re=Math.min(Re,q.count));let Ve=Re-Te;if(Ve<0||Ve===1/0)return;mt.setup(H,K,V,X,J);let dt,Je=Se;if(J!==null&&(dt=ie.get(J),Je=tt,Je.setIndex(dt)),H.isMesh)K.wireframe===!0?(ve.setLineWidth(K.wireframeLinewidth*Ke()),Je.setMode(L.LINES)):Je.setMode(L.TRIANGLES);else if(H.isLine){let Le=K.linewidth;Le===void 0&&(Le=1),ve.setLineWidth(Le*Ke()),H.isLineSegments?Je.setMode(L.LINES):H.isLineLoop?Je.setMode(L.LINE_LOOP):Je.setMode(L.LINE_STRIP)}else H.isPoints?Je.setMode(L.POINTS):H.isSprite&&Je.setMode(L.TRIANGLES);if(H.isBatchedMesh)if(H._multiDrawInstances!==null)ts("THREE.WebGLRenderer: renderMultiDrawInstances has been deprecated and will be removed in r184. Append to renderMultiDraw arguments and use indirection."),Je.renderMultiDrawInstances(H._multiDrawStarts,H._multiDrawCounts,H._multiDrawCount,H._multiDrawInstances);else if(rt.get("WEBGL_multi_draw"))Je.renderMultiDraw(H._multiDrawStarts,H._multiDrawCounts,H._multiDrawCount);else{let Le=H._multiDrawStarts,Gt=H._multiDrawCounts,at=H._multiDrawCount,an=J?ie.get(J).bytesPerElement:1,cn=Ce.get(K).currentProgram.getUniforms();for(let Zt=0;Zt<at;Zt++)cn.setValue(L,"_gl_DrawID",Zt),Je.render(Le[Zt]/an,Gt[Zt])}else if(H.isInstancedMesh)Je.renderInstances(Te,Ve,H.count);else if(X.isInstancedBufferGeometry){let Le=X._maxInstanceCount!==void 0?X._maxInstanceCount:1/0,Gt=Math.min(X.instanceCount,Le);Je.renderInstances(Te,Ve,Gt)}else Je.render(Te,Ve)};function nt(E,B,X){E.transparent===!0&&E.side===kt&&E.forceSinglePass===!1?(E.side=Vt,E.needsUpdate=!0,Hn(E,B,X),E.side=Zn,E.needsUpdate=!0,Hn(E,B,X),E.side=kt):Hn(E,B,X)}this.compile=function(E,B,X=null){X===null&&(X=E),f=We.get(X),f.init(B),S.push(f),X.traverseVisible(function(H){H.isLight&&H.layers.test(B.layers)&&(f.pushLight(H),H.castShadow&&f.pushShadow(H))}),E!==X&&E.traverseVisible(function(H){H.isLight&&H.layers.test(B.layers)&&(f.pushLight(H),H.castShadow&&f.pushShadow(H))}),f.setupLights();let K=new Set;return E.traverse(function(H){if(!(H.isMesh||H.isPoints||H.isLine||H.isSprite))return;let C=H.material;if(C)if(Array.isArray(C))for(let G=0;G<C.length;G++){let V=C[G];nt(V,X,H),K.add(V)}else nt(C,X,H),K.add(C)}),f=S.pop(),K},this.compileAsync=function(E,B,X=null){let K=this.compile(E,B,X);return new Promise(H=>{function C(){if(K.forEach(function(G){Ce.get(G).currentProgram.isReady()&&K.delete(G)}),K.size===0){H(E);return}setTimeout(C,10)}rt.get("KHR_parallel_shader_compile")!==null?C():setTimeout(C,10)})};let Dt=null;function Ot(E){Dt&&Dt(E)}function xn(){qt.stop()}function hn(){qt.start()}let qt=new df;qt.setAnimationLoop(Ot),typeof self<"u"&&qt.setContext(self),this.setAnimationLoop=function(E){Dt=E,j.setAnimationLoop(E),E===null?qt.stop():qt.start()},j.addEventListener("sessionstart",xn),j.addEventListener("sessionend",hn),this.render=function(E,B){if(B!==void 0&&B.isCamera!==!0){console.error("THREE.WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(P===!0)return;if(E.matrixWorldAutoUpdate===!0&&E.updateMatrixWorld(),B.parent===null&&B.matrixWorldAutoUpdate===!0&&B.updateMatrixWorld(),j.enabled===!0&&j.isPresenting===!0&&(j.cameraAutoUpdate===!0&&j.updateCamera(B),B=j.getCamera()),E.isScene===!0&&E.onBeforeRender(x,E,B,R),f=We.get(E,S.length),f.init(B),S.push(f),Be.multiplyMatrices(B.projectionMatrix,B.matrixWorldInverse),te.setFromProjectionMatrix(Be),Ae=this.localClippingEnabled,ue=le.init(this.clippingPlanes,Ae),m=be.get(E,v.length),m.init(),v.push(m),j.enabled===!0&&j.isPresenting===!0){let C=x.xr.getDepthSensingMesh();C!==null&&un(C,B,-1/0,x.sortObjects)}un(E,B,0,x.sortObjects),m.finish(),x.sortObjects===!0&&m.sort(ce,pe),et=j.enabled===!1||j.isPresenting===!1||j.hasDepthSensing()===!1,et&&Pe.addToRenderList(m,E),this.info.render.frame++,ue===!0&&le.beginShadows();let X=f.state.shadowsArray;Ee.render(X,E,B),ue===!0&&le.endShadows(),this.info.autoReset===!0&&this.info.reset();let K=m.opaque,H=m.transmissive;if(f.setupLights(),B.isArrayCamera){let C=B.cameras;if(H.length>0)for(let G=0,V=C.length;G<V;G++){let J=C[G];zn(K,H,E,J)}et&&Pe.render(E);for(let G=0,V=C.length;G<V;G++){let J=C[G];zt(m,E,J,J.viewport)}}else H.length>0&&zn(K,H,E,B),et&&Pe.render(E),zt(m,E,B);R!==null&&w===0&&(A.updateMultisampleRenderTarget(R),A.updateRenderTargetMipmap(R)),E.isScene===!0&&E.onAfterRender(x,E,B),mt.resetDefaultState(),M=-1,y=null,S.pop(),S.length>0?(f=S[S.length-1],ue===!0&&le.setGlobalState(x.clippingPlanes,f.state.camera)):f=null,v.pop(),v.length>0?m=v[v.length-1]:m=null};function un(E,B,X,K){if(E.visible===!1)return;if(E.layers.test(B.layers)){if(E.isGroup)X=E.renderOrder;else if(E.isLOD)E.autoUpdate===!0&&E.update(B);else if(E.isLight)f.pushLight(E),E.castShadow&&f.pushShadow(E);else if(E.isSprite){if(!E.frustumCulled||te.intersectsSprite(E)){K&&Fe.setFromMatrixPosition(E.matrixWorld).applyMatrix4(Be);let G=Z.update(E),V=E.material;V.visible&&m.push(E,G,V,X,Fe.z,null)}}else if((E.isMesh||E.isLine||E.isPoints)&&(!E.frustumCulled||te.intersectsObject(E))){let G=Z.update(E),V=E.material;if(K&&(E.boundingSphere!==void 0?(E.boundingSphere===null&&E.computeBoundingSphere(),Fe.copy(E.boundingSphere.center)):(G.boundingSphere===null&&G.computeBoundingSphere(),Fe.copy(G.boundingSphere.center)),Fe.applyMatrix4(E.matrixWorld).applyMatrix4(Be)),Array.isArray(V)){let J=G.groups;for(let Q=0,ae=J.length;Q<ae;Q++){let q=J[Q],Te=V[q.materialIndex];Te&&Te.visible&&m.push(E,G,Te,X,Fe.z,q)}}else V.visible&&m.push(E,G,V,X,Fe.z,null)}}let C=E.children;for(let G=0,V=C.length;G<V;G++)un(C[G],B,X,K)}function zt(E,B,X,K){let H=E.opaque,C=E.transmissive,G=E.transparent;f.setupLightsView(X),ue===!0&&le.setGlobalState(x.clippingPlanes,X),K&&ve.viewport(I.copy(K)),H.length>0&&Ut(H,B,X),C.length>0&&Ut(C,B,X),G.length>0&&Ut(G,B,X),ve.buffers.depth.setTest(!0),ve.buffers.depth.setMask(!0),ve.buffers.color.setMask(!0),ve.setPolygonOffset(!1)}function zn(E,B,X,K){if((X.isScene===!0?X.overrideMaterial:null)!==null)return;f.state.transmissionRenderTarget[K.id]===void 0&&(f.state.transmissionRenderTarget[K.id]=new ai(1,1,{generateMipmaps:!0,type:rt.has("EXT_color_buffer_half_float")||rt.has("EXT_color_buffer_float")?Qn:fi,minFilter:Bn,samples:4,stencilBuffer:r,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:ft.workingColorSpace}));let C=f.state.transmissionRenderTarget[K.id],G=K.viewport||I;C.setSize(G.z*x.transmissionResolutionScale,G.w*x.transmissionResolutionScale);let V=x.getRenderTarget();x.setRenderTarget(C),x.getClearColor(O),$=x.getClearAlpha(),$<1&&x.setClearColor(16777215,.5),x.clear(),et&&Pe.render(X);let J=x.toneMapping;x.toneMapping=Ni;let Q=K.viewport;if(K.viewport!==void 0&&(K.viewport=void 0),f.setupLightsView(K),ue===!0&&le.setGlobalState(x.clippingPlanes,K),Ut(E,X,K),A.updateMultisampleRenderTarget(C),A.updateRenderTargetMipmap(C),rt.has("WEBGL_multisampled_render_to_texture")===!1){let ae=!1;for(let q=0,Te=B.length;q<Te;q++){let Re=B[q],Ve=Re.object,dt=Re.geometry,Je=Re.material,Le=Re.group;if(Je.side===kt&&Ve.layers.test(K.layers)){let Gt=Je.side;Je.side=Vt,Je.needsUpdate=!0,yn(Ve,X,K,dt,Je,Le),Je.side=Gt,Je.needsUpdate=!0,ae=!0}}ae===!0&&(A.updateMultisampleRenderTarget(C),A.updateRenderTargetMipmap(C))}x.setRenderTarget(V),x.setClearColor(O,$),Q!==void 0&&(K.viewport=Q),x.toneMapping=J}function Ut(E,B,X){let K=B.isScene===!0?B.overrideMaterial:null;for(let H=0,C=E.length;H<C;H++){let G=E[H],V=G.object,J=G.geometry,Q=K===null?G.material:K,ae=G.group;V.layers.test(X.layers)&&yn(V,B,X,J,Q,ae)}}function yn(E,B,X,K,H,C){E.onBeforeRender(x,B,X,K,H,C),E.modelViewMatrix.multiplyMatrices(X.matrixWorldInverse,E.matrixWorld),E.normalMatrix.getNormalMatrix(E.modelViewMatrix),H.onBeforeRender(x,B,X,K,E,C),H.transparent===!0&&H.side===kt&&H.forceSinglePass===!1?(H.side=Vt,H.needsUpdate=!0,x.renderBufferDirect(X,B,K,H,E,C),H.side=Zn,H.needsUpdate=!0,x.renderBufferDirect(X,B,K,H,E,C),H.side=kt):x.renderBufferDirect(X,B,K,H,E,C),E.onAfterRender(x,B,X,K,H,C)}function Hn(E,B,X){B.isScene!==!0&&(B=Ne);let K=Ce.get(E),H=f.state.lights,C=f.state.shadowsArray,G=H.state.version,V=xe.getParameters(E,H.state,C,B,X),J=xe.getProgramCacheKey(V),Q=K.programs;K.environment=E.isMeshStandardMaterial?B.environment:null,K.fog=B.fog,K.envMap=(E.isMeshStandardMaterial?W:b).get(E.envMap||K.environment),K.envMapRotation=K.environment!==null&&E.envMap===null?B.environmentRotation:E.envMapRotation,Q===void 0&&(E.addEventListener("dispose",He),Q=new Map,K.programs=Q);let ae=Q.get(J);if(ae!==void 0){if(K.currentProgram===ae&&K.lightsStateVersion===G)return Vs(E,V),ae}else V.uniforms=xe.getUniforms(E),E.onBeforeCompile(V,x),ae=xe.acquireProgram(V,J),Q.set(J,ae),K.uniforms=V.uniforms;let q=K.uniforms;return(!E.isShaderMaterial&&!E.isRawShaderMaterial||E.clipping===!0)&&(q.clippingPlanes=le.uniform),Vs(E,V),K.needsLights=_i(E),K.lightsStateVersion=G,K.needsLights&&(q.ambientLightColor.value=H.state.ambient,q.lightProbe.value=H.state.probe,q.directionalLights.value=H.state.directional,q.directionalLightShadows.value=H.state.directionalShadow,q.spotLights.value=H.state.spot,q.spotLightShadows.value=H.state.spotShadow,q.rectAreaLights.value=H.state.rectArea,q.ltc_1.value=H.state.rectAreaLTC1,q.ltc_2.value=H.state.rectAreaLTC2,q.pointLights.value=H.state.point,q.pointLightShadows.value=H.state.pointShadow,q.hemisphereLights.value=H.state.hemi,q.directionalShadowMap.value=H.state.directionalShadowMap,q.directionalShadowMatrix.value=H.state.directionalShadowMatrix,q.spotShadowMap.value=H.state.spotShadowMap,q.spotLightMatrix.value=H.state.spotLightMatrix,q.spotLightMap.value=H.state.spotLightMap,q.pointShadowMap.value=H.state.pointShadowMap,q.pointShadowMatrix.value=H.state.pointShadowMatrix),K.currentProgram=ae,K.uniformsList=null,ae}function gi(E){if(E.uniformsList===null){let B=E.currentProgram.getUniforms();E.uniformsList=vr.seqWithValue(B.seq,E.uniforms)}return E.uniformsList}function Vs(E,B){let X=Ce.get(E);X.outputColorSpace=B.outputColorSpace,X.batching=B.batching,X.batchingColor=B.batchingColor,X.instancing=B.instancing,X.instancingColor=B.instancingColor,X.instancingMorph=B.instancingMorph,X.skinning=B.skinning,X.morphTargets=B.morphTargets,X.morphNormals=B.morphNormals,X.morphColors=B.morphColors,X.morphTargetsCount=B.morphTargetsCount,X.numClippingPlanes=B.numClippingPlanes,X.numIntersection=B.numClipIntersection,X.vertexAlphas=B.vertexAlphas,X.vertexTangents=B.vertexTangents,X.toneMapping=B.toneMapping}function ti(E,B,X,K,H){B.isScene!==!0&&(B=Ne),A.resetTextureUnits();let C=B.fog,G=K.isMeshStandardMaterial?B.environment:null,V=R===null?x.outputColorSpace:R.isXRRenderTarget===!0?R.texture.colorSpace:Jt,J=(K.isMeshStandardMaterial?W:b).get(K.envMap||G),Q=K.vertexColors===!0&&!!X.attributes.color&&X.attributes.color.itemSize===4,ae=!!X.attributes.tangent&&(!!K.normalMap||K.anisotropy>0),q=!!X.morphAttributes.position,Te=!!X.morphAttributes.normal,Re=!!X.morphAttributes.color,Ve=Ni;K.toneMapped&&(R===null||R.isXRRenderTarget===!0)&&(Ve=x.toneMapping);let dt=X.morphAttributes.position||X.morphAttributes.normal||X.morphAttributes.color,Je=dt!==void 0?dt.length:0,Le=Ce.get(K),Gt=f.state.lights;if(ue===!0&&(Ae===!0||E!==y)){let z=E===y&&K.id===M;le.setState(K,E,z)}let at=!1;K.version===Le.__version?(Le.needsLights&&Le.lightsStateVersion!==Gt.state.version||Le.outputColorSpace!==V||H.isBatchedMesh&&Le.batching===!1||!H.isBatchedMesh&&Le.batching===!0||H.isBatchedMesh&&Le.batchingColor===!0&&H.colorTexture===null||H.isBatchedMesh&&Le.batchingColor===!1&&H.colorTexture!==null||H.isInstancedMesh&&Le.instancing===!1||!H.isInstancedMesh&&Le.instancing===!0||H.isSkinnedMesh&&Le.skinning===!1||!H.isSkinnedMesh&&Le.skinning===!0||H.isInstancedMesh&&Le.instancingColor===!0&&H.instanceColor===null||H.isInstancedMesh&&Le.instancingColor===!1&&H.instanceColor!==null||H.isInstancedMesh&&Le.instancingMorph===!0&&H.morphTexture===null||H.isInstancedMesh&&Le.instancingMorph===!1&&H.morphTexture!==null||Le.envMap!==J||K.fog===!0&&Le.fog!==C||Le.numClippingPlanes!==void 0&&(Le.numClippingPlanes!==le.numPlanes||Le.numIntersection!==le.numIntersection)||Le.vertexAlphas!==Q||Le.vertexTangents!==ae||Le.morphTargets!==q||Le.morphNormals!==Te||Le.morphColors!==Re||Le.toneMapping!==Ve||Le.morphTargetsCount!==Je)&&(at=!0):(at=!0,Le.__version=K.version);let an=Le.currentProgram;at===!0&&(an=Hn(K,B,H));let cn=!1,Zt=!1,Un=!1,oe=an.getUniforms(),it=Le.uniforms;if(ve.useProgram(an.program)&&(cn=!0,Zt=!0,Un=!0),K.id!==M&&(M=K.id,Zt=!0),cn||y!==E){ve.buffers.depth.getReversed()?(ye.copy(E.projectionMatrix),Nd(ye),Fd(ye),oe.setValue(L,"projectionMatrix",ye)):oe.setValue(L,"projectionMatrix",E.projectionMatrix),oe.setValue(L,"viewMatrix",E.matrixWorldInverse);let re=oe.map.cameraPosition;re!==void 0&&re.setValue(L,qe.setFromMatrixPosition(E.matrixWorld)),ot.logarithmicDepthBuffer&&oe.setValue(L,"logDepthBufFC",2/(Math.log(E.far+1)/Math.LN2)),(K.isMeshPhongMaterial||K.isMeshToonMaterial||K.isMeshLambertMaterial||K.isMeshBasicMaterial||K.isMeshStandardMaterial||K.isShaderMaterial)&&oe.setValue(L,"isOrthographic",E.isOrthographicCamera===!0),y!==E&&(y=E,Zt=!0,Un=!0)}if(H.isSkinnedMesh){oe.setOptional(L,H,"bindMatrix"),oe.setOptional(L,H,"bindMatrixInverse");let z=H.skeleton;z&&(z.boneTexture===null&&z.computeBoneTexture(),oe.setValue(L,"boneTexture",z.boneTexture,A))}H.isBatchedMesh&&(oe.setOptional(L,H,"batchingTexture"),oe.setValue(L,"batchingTexture",H._matricesTexture,A),oe.setOptional(L,H,"batchingIdTexture"),oe.setValue(L,"batchingIdTexture",H._indirectTexture,A),oe.setOptional(L,H,"batchingColorTexture"),H._colorsTexture!==null&&oe.setValue(L,"batchingColorTexture",H._colorsTexture,A));let Xe=X.morphAttributes;if((Xe.position!==void 0||Xe.normal!==void 0||Xe.color!==void 0)&&Oe.update(H,X,an),(Zt||Le.receiveShadow!==H.receiveShadow)&&(Le.receiveShadow=H.receiveShadow,oe.setValue(L,"receiveShadow",H.receiveShadow)),K.isMeshGouraudMaterial&&K.envMap!==null&&(it.envMap.value=J,it.flipEnvMap.value=J.isCubeTexture&&J.isRenderTargetTexture===!1?-1:1),K.isMeshStandardMaterial&&K.envMap===null&&B.environment!==null&&(it.envMapIntensity.value=B.environmentIntensity),Zt&&(oe.setValue(L,"toneMappingExposure",x.toneMappingExposure),Le.needsLights&&tn(it,Un),C&&K.fog===!0&&_e.refreshFogUniforms(it,C),_e.refreshMaterialUniforms(it,K,Y,ee,f.state.transmissionRenderTarget[E.id]),vr.upload(L,gi(Le),it,A)),K.isShaderMaterial&&K.uniformsNeedUpdate===!0&&(vr.upload(L,gi(Le),it,A),K.uniformsNeedUpdate=!1),K.isSpriteMaterial&&oe.setValue(L,"center",H.center),oe.setValue(L,"modelViewMatrix",H.modelViewMatrix),oe.setValue(L,"normalMatrix",H.normalMatrix),oe.setValue(L,"modelMatrix",H.matrixWorld),K.isShaderMaterial||K.isRawShaderMaterial){let z=K.uniformsGroups;for(let re=0,he=z.length;re<he;re++){let De=z[re];N.update(De,an),N.bind(De,an)}}return an}function tn(E,B){E.ambientLightColor.needsUpdate=B,E.lightProbe.needsUpdate=B,E.directionalLights.needsUpdate=B,E.directionalLightShadows.needsUpdate=B,E.pointLights.needsUpdate=B,E.pointLightShadows.needsUpdate=B,E.spotLights.needsUpdate=B,E.spotLightShadows.needsUpdate=B,E.rectAreaLights.needsUpdate=B,E.hemisphereLights.needsUpdate=B}function _i(E){return E.isMeshLambertMaterial||E.isMeshToonMaterial||E.isMeshPhongMaterial||E.isMeshStandardMaterial||E.isShadowMaterial||E.isShaderMaterial&&E.lights===!0}this.getActiveCubeFace=function(){return T},this.getActiveMipmapLevel=function(){return w},this.getRenderTarget=function(){return R},this.setRenderTargetTextures=function(E,B,X){Ce.get(E.texture).__webglTexture=B,Ce.get(E.depthTexture).__webglTexture=X;let K=Ce.get(E);K.__hasExternalTextures=!0,K.__autoAllocateDepthBuffer=X===void 0,K.__autoAllocateDepthBuffer||rt.has("WEBGL_multisampled_render_to_texture")===!0&&(console.warn("THREE.WebGLRenderer: Render-to-texture extension was disabled because an external texture was provided"),K.__useRenderToTexture=!1)},this.setRenderTargetFramebuffer=function(E,B){let X=Ce.get(E);X.__webglFramebuffer=B,X.__useDefaultFramebuffer=B===void 0};let ni=L.createFramebuffer();this.setRenderTarget=function(E,B=0,X=0){R=E,T=B,w=X;let K=!0,H=null,C=!1,G=!1;if(E){let J=Ce.get(E);if(J.__useDefaultFramebuffer!==void 0)ve.bindFramebuffer(L.FRAMEBUFFER,null),K=!1;else if(J.__webglFramebuffer===void 0)A.setupRenderTarget(E);else if(J.__hasExternalTextures)A.rebindTextures(E,Ce.get(E.texture).__webglTexture,Ce.get(E.depthTexture).__webglTexture);else if(E.depthBuffer){let q=E.depthTexture;if(J.__boundDepthTexture!==q){if(q!==null&&Ce.has(q)&&(E.width!==q.image.width||E.height!==q.image.height))throw new Error("WebGLRenderTarget: Attached DepthTexture is initialized to the incorrect size.");A.setupDepthRenderbuffer(E)}}let Q=E.texture;(Q.isData3DTexture||Q.isDataArrayTexture||Q.isCompressedArrayTexture)&&(G=!0);let ae=Ce.get(E).__webglFramebuffer;E.isWebGLCubeRenderTarget?(Array.isArray(ae[B])?H=ae[B][X]:H=ae[B],C=!0):E.samples>0&&A.useMultisampledRTT(E)===!1?H=Ce.get(E).__webglMultisampledFramebuffer:Array.isArray(ae)?H=ae[X]:H=ae,I.copy(E.viewport),F.copy(E.scissor),U=E.scissorTest}else I.copy(Ie).multiplyScalar(Y).floor(),F.copy(Ue).multiplyScalar(Y).floor(),U=Ge;if(X!==0&&(H=ni),ve.bindFramebuffer(L.FRAMEBUFFER,H)&&K&&ve.drawBuffers(E,H),ve.viewport(I),ve.scissor(F),ve.setScissorTest(U),C){let J=Ce.get(E.texture);L.framebufferTexture2D(L.FRAMEBUFFER,L.COLOR_ATTACHMENT0,L.TEXTURE_CUBE_MAP_POSITIVE_X+B,J.__webglTexture,X)}else if(G){let J=Ce.get(E.texture),Q=B;L.framebufferTextureLayer(L.FRAMEBUFFER,L.COLOR_ATTACHMENT0,J.__webglTexture,X,Q)}else if(E!==null&&X!==0){let J=Ce.get(E.texture);L.framebufferTexture2D(L.FRAMEBUFFER,L.COLOR_ATTACHMENT0,L.TEXTURE_2D,J.__webglTexture,X)}M=-1},this.readRenderTargetPixels=function(E,B,X,K,H,C,G){if(!(E&&E.isWebGLRenderTarget)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let V=Ce.get(E).__webglFramebuffer;if(E.isWebGLCubeRenderTarget&&G!==void 0&&(V=V[G]),V){ve.bindFramebuffer(L.FRAMEBUFFER,V);try{let J=E.texture,Q=J.format,ae=J.type;if(!ot.textureFormatReadable(Q)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!ot.textureTypeReadable(ae)){console.error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}B>=0&&B<=E.width-K&&X>=0&&X<=E.height-H&&L.readPixels(B,X,K,H,ze.convert(Q),ze.convert(ae),C)}finally{let J=R!==null?Ce.get(R).__webglFramebuffer:null;ve.bindFramebuffer(L.FRAMEBUFFER,J)}}},this.readRenderTargetPixelsAsync=async function(E,B,X,K,H,C,G){if(!(E&&E.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let V=Ce.get(E).__webglFramebuffer;if(E.isWebGLCubeRenderTarget&&G!==void 0&&(V=V[G]),V){let J=E.texture,Q=J.format,ae=J.type;if(!ot.textureFormatReadable(Q))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!ot.textureTypeReadable(ae))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");if(B>=0&&B<=E.width-K&&X>=0&&X<=E.height-H){ve.bindFramebuffer(L.FRAMEBUFFER,V);let q=L.createBuffer();L.bindBuffer(L.PIXEL_PACK_BUFFER,q),L.bufferData(L.PIXEL_PACK_BUFFER,C.byteLength,L.STREAM_READ),L.readPixels(B,X,K,H,ze.convert(Q),ze.convert(ae),0);let Te=R!==null?Ce.get(R).__webglFramebuffer:null;ve.bindFramebuffer(L.FRAMEBUFFER,Te);let Re=L.fenceSync(L.SYNC_GPU_COMMANDS_COMPLETE,0);return L.flush(),await Ud(L,Re,4),L.bindBuffer(L.PIXEL_PACK_BUFFER,q),L.getBufferSubData(L.PIXEL_PACK_BUFFER,0,C),L.deleteBuffer(q),L.deleteSync(Re),C}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")}},this.copyFramebufferToTexture=function(E,B=null,X=0){E.isTexture!==!0&&(ts("WebGLRenderer: copyFramebufferToTexture function signature has changed."),B=arguments[0]||null,E=arguments[1]);let K=Math.pow(2,-X),H=Math.floor(E.image.width*K),C=Math.floor(E.image.height*K),G=B!==null?B.x:0,V=B!==null?B.y:0;A.setTexture2D(E,0),L.copyTexSubImage2D(L.TEXTURE_2D,X,0,0,G,V,H,C),ve.unbindTexture()};let Sn=L.createFramebuffer(),Ht=L.createFramebuffer();this.copyTextureToTexture=function(E,B,X=null,K=null,H=0,C=null){E.isTexture!==!0&&(ts("WebGLRenderer: copyTextureToTexture function signature has changed."),K=arguments[0]||null,E=arguments[1],B=arguments[2],C=arguments[3]||0,X=null),C===null&&(H!==0?(ts("WebGLRenderer: copyTextureToTexture function signature has changed to support src and dst mipmap levels."),C=H,H=0):C=0);let G,V,J,Q,ae,q,Te,Re,Ve,dt=E.isCompressedTexture?E.mipmaps[C]:E.image;if(X!==null)G=X.max.x-X.min.x,V=X.max.y-X.min.y,J=X.isBox3?X.max.z-X.min.z:1,Q=X.min.x,ae=X.min.y,q=X.isBox3?X.min.z:0;else{let Xe=Math.pow(2,-H);G=Math.floor(dt.width*Xe),V=Math.floor(dt.height*Xe),E.isDataArrayTexture?J=dt.depth:E.isData3DTexture?J=Math.floor(dt.depth*Xe):J=1,Q=0,ae=0,q=0}K!==null?(Te=K.x,Re=K.y,Ve=K.z):(Te=0,Re=0,Ve=0);let Je=ze.convert(B.format),Le=ze.convert(B.type),Gt;B.isData3DTexture?(A.setTexture3D(B,0),Gt=L.TEXTURE_3D):B.isDataArrayTexture||B.isCompressedArrayTexture?(A.setTexture2DArray(B,0),Gt=L.TEXTURE_2D_ARRAY):(A.setTexture2D(B,0),Gt=L.TEXTURE_2D),L.pixelStorei(L.UNPACK_FLIP_Y_WEBGL,B.flipY),L.pixelStorei(L.UNPACK_PREMULTIPLY_ALPHA_WEBGL,B.premultiplyAlpha),L.pixelStorei(L.UNPACK_ALIGNMENT,B.unpackAlignment);let at=L.getParameter(L.UNPACK_ROW_LENGTH),an=L.getParameter(L.UNPACK_IMAGE_HEIGHT),cn=L.getParameter(L.UNPACK_SKIP_PIXELS),Zt=L.getParameter(L.UNPACK_SKIP_ROWS),Un=L.getParameter(L.UNPACK_SKIP_IMAGES);L.pixelStorei(L.UNPACK_ROW_LENGTH,dt.width),L.pixelStorei(L.UNPACK_IMAGE_HEIGHT,dt.height),L.pixelStorei(L.UNPACK_SKIP_PIXELS,Q),L.pixelStorei(L.UNPACK_SKIP_ROWS,ae),L.pixelStorei(L.UNPACK_SKIP_IMAGES,q);let oe=E.isDataArrayTexture||E.isData3DTexture,it=B.isDataArrayTexture||B.isData3DTexture;if(E.isDepthTexture){let Xe=Ce.get(E),z=Ce.get(B),re=Ce.get(Xe.__renderTarget),he=Ce.get(z.__renderTarget);ve.bindFramebuffer(L.READ_FRAMEBUFFER,re.__webglFramebuffer),ve.bindFramebuffer(L.DRAW_FRAMEBUFFER,he.__webglFramebuffer);for(let De=0;De<J;De++)oe&&(L.framebufferTextureLayer(L.READ_FRAMEBUFFER,L.COLOR_ATTACHMENT0,Ce.get(E).__webglTexture,H,q+De),L.framebufferTextureLayer(L.DRAW_FRAMEBUFFER,L.COLOR_ATTACHMENT0,Ce.get(B).__webglTexture,C,Ve+De)),L.blitFramebuffer(Q,ae,G,V,Te,Re,G,V,L.DEPTH_BUFFER_BIT,L.NEAREST);ve.bindFramebuffer(L.READ_FRAMEBUFFER,null),ve.bindFramebuffer(L.DRAW_FRAMEBUFFER,null)}else if(H!==0||E.isRenderTargetTexture||Ce.has(E)){let Xe=Ce.get(E),z=Ce.get(B);ve.bindFramebuffer(L.READ_FRAMEBUFFER,Sn),ve.bindFramebuffer(L.DRAW_FRAMEBUFFER,Ht);for(let re=0;re<J;re++)oe?L.framebufferTextureLayer(L.READ_FRAMEBUFFER,L.COLOR_ATTACHMENT0,Xe.__webglTexture,H,q+re):L.framebufferTexture2D(L.READ_FRAMEBUFFER,L.COLOR_ATTACHMENT0,L.TEXTURE_2D,Xe.__webglTexture,H),it?L.framebufferTextureLayer(L.DRAW_FRAMEBUFFER,L.COLOR_ATTACHMENT0,z.__webglTexture,C,Ve+re):L.framebufferTexture2D(L.DRAW_FRAMEBUFFER,L.COLOR_ATTACHMENT0,L.TEXTURE_2D,z.__webglTexture,C),H!==0?L.blitFramebuffer(Q,ae,G,V,Te,Re,G,V,L.COLOR_BUFFER_BIT,L.NEAREST):it?L.copyTexSubImage3D(Gt,C,Te,Re,Ve+re,Q,ae,G,V):L.copyTexSubImage2D(Gt,C,Te,Re,Q,ae,G,V);ve.bindFramebuffer(L.READ_FRAMEBUFFER,null),ve.bindFramebuffer(L.DRAW_FRAMEBUFFER,null)}else it?E.isDataTexture||E.isData3DTexture?L.texSubImage3D(Gt,C,Te,Re,Ve,G,V,J,Je,Le,dt.data):B.isCompressedArrayTexture?L.compressedTexSubImage3D(Gt,C,Te,Re,Ve,G,V,J,Je,dt.data):L.texSubImage3D(Gt,C,Te,Re,Ve,G,V,J,Je,Le,dt):E.isDataTexture?L.texSubImage2D(L.TEXTURE_2D,C,Te,Re,G,V,Je,Le,dt.data):E.isCompressedTexture?L.compressedTexSubImage2D(L.TEXTURE_2D,C,Te,Re,dt.width,dt.height,Je,dt.data):L.texSubImage2D(L.TEXTURE_2D,C,Te,Re,G,V,Je,Le,dt);L.pixelStorei(L.UNPACK_ROW_LENGTH,at),L.pixelStorei(L.UNPACK_IMAGE_HEIGHT,an),L.pixelStorei(L.UNPACK_SKIP_PIXELS,cn),L.pixelStorei(L.UNPACK_SKIP_ROWS,Zt),L.pixelStorei(L.UNPACK_SKIP_IMAGES,Un),C===0&&B.generateMipmaps&&L.generateMipmap(Gt),ve.unbindTexture()},this.copyTextureToTexture3D=function(E,B,X=null,K=null,H=0){return E.isTexture!==!0&&(ts("WebGLRenderer: copyTextureToTexture3D function signature has changed."),X=arguments[0]||null,K=arguments[1]||null,E=arguments[2],B=arguments[3],H=arguments[4]||0),ts('WebGLRenderer: copyTextureToTexture3D function has been deprecated. Use "copyTextureToTexture" instead.'),this.copyTextureToTexture(E,B,X,K,H)},this.initRenderTarget=function(E){Ce.get(E).__webglFramebuffer===void 0&&A.setupRenderTarget(E)},this.initTexture=function(E){E.isCubeTexture?A.setTextureCube(E,0):E.isData3DTexture?A.setTexture3D(E,0):E.isDataArrayTexture||E.isCompressedArrayTexture?A.setTexture2DArray(E,0):A.setTexture2D(E,0),ve.unbindTexture()},this.resetState=function(){T=0,w=0,R=null,ve.reset(),mt.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return oi}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(e){this._outputColorSpace=e;let t=this.getContext();t.drawingBufferColorspace=ft._getDrawingBufferColorSpace(e),t.unpackColorSpace=ft._getUnpackColorSpace()}};function dh(s,e){if(e===Hl)return console.warn("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Geometry already defined as triangles."),s;if(e===_r||e===To){let t=s.getIndex();if(t===null){let o=[],a=s.getAttribute("position");if(a!==void 0){for(let c=0;c<a.count;c++)o.push(c);s.setIndex(o),t=s.getIndex()}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Undefined position attribute. Processing not possible."),s}let n=t.count-2,i=[];if(e===_r)for(let o=1;o<=n;o++)i.push(t.getX(0)),i.push(t.getX(o)),i.push(t.getX(o+1));else for(let o=0;o<n;o++)o%2===0?(i.push(t.getX(o)),i.push(t.getX(o+1)),i.push(t.getX(o+2))):(i.push(t.getX(o+2)),i.push(t.getX(o+1)),i.push(t.getX(o)));i.length/3!==n&&console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unable to generate correct amount of triangles.");let r=s.clone();return r.setIndex(i),r.clearGroups(),r}else return console.error("THREE.BufferGeometryUtils.toTrianglesDrawMode(): Unknown draw mode:",e),s}var Ec=class extends $n{constructor(e){super(e),this.dracoLoader=null,this.ktx2Loader=null,this.meshoptDecoder=null,this.pluginCallbacks=[],this.register(function(t){return new yh(t)}),this.register(function(t){return new vh(t)}),this.register(function(t){return new Ch(t)}),this.register(function(t){return new Ih(t)}),this.register(function(t){return new Ph(t)}),this.register(function(t){return new bh(t)}),this.register(function(t){return new Sh(t)}),this.register(function(t){return new Eh(t)}),this.register(function(t){return new Th(t)}),this.register(function(t){return new xh(t)}),this.register(function(t){return new Ah(t)}),this.register(function(t){return new Mh(t)}),this.register(function(t){return new Rh(t)}),this.register(function(t){return new wh(t)}),this.register(function(t){return new gh(t)}),this.register(function(t){return new Lh(t)}),this.register(function(t){return new Dh(t)})}load(e,t,n,i){let r=this,o;if(this.resourcePath!=="")o=this.resourcePath;else if(this.path!==""){let l=Di.extractUrlBase(e);o=Di.resolveURL(l,this.path)}else o=Di.extractUrlBase(e);this.manager.itemStart(e);let a=function(l){i?i(l):console.error(l),r.manager.itemError(e),r.manager.itemEnd(e)},c=new Es(this.manager);c.setPath(this.path),c.setResponseType("arraybuffer"),c.setRequestHeader(this.requestHeader),c.setWithCredentials(this.withCredentials),c.load(e,function(l){try{r.parse(l,o,function(h){t(h),r.manager.itemEnd(e)},a)}catch(h){a(h)}},n,a)}setDRACOLoader(e){return this.dracoLoader=e,this}setKTX2Loader(e){return this.ktx2Loader=e,this}setMeshoptDecoder(e){return this.meshoptDecoder=e,this}register(e){return this.pluginCallbacks.indexOf(e)===-1&&this.pluginCallbacks.push(e),this}unregister(e){return this.pluginCallbacks.indexOf(e)!==-1&&this.pluginCallbacks.splice(this.pluginCallbacks.indexOf(e),1),this}parse(e,t,n,i){let r,o={},a={},c=new TextDecoder;if(typeof e=="string")r=JSON.parse(e);else if(e instanceof ArrayBuffer)if(c.decode(new Uint8Array(e,0,4))===bf){try{o[ut.KHR_BINARY_GLTF]=new Uh(e)}catch(u){i&&i(u);return}r=JSON.parse(o[ut.KHR_BINARY_GLTF].content)}else r=JSON.parse(c.decode(e));else r=e;if(r.asset===void 0||r.asset.version[0]<2){i&&i(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."));return}let l=new kh(r,{path:t||this.resourcePath||"",crossOrigin:this.crossOrigin,requestHeader:this.requestHeader,manager:this.manager,ktx2Loader:this.ktx2Loader,meshoptDecoder:this.meshoptDecoder});l.fileLoader.setRequestHeader(this.requestHeader);for(let h=0;h<this.pluginCallbacks.length;h++){let u=this.pluginCallbacks[h](l);u.name||console.error("THREE.GLTFLoader: Invalid plugin found: missing name"),a[u.name]=u,o[u.name]=!0}if(r.extensionsUsed)for(let h=0;h<r.extensionsUsed.length;++h){let u=r.extensionsUsed[h],d=r.extensionsRequired||[];switch(u){case ut.KHR_MATERIALS_UNLIT:o[u]=new _h;break;case ut.KHR_DRACO_MESH_COMPRESSION:o[u]=new Nh(r,this.dracoLoader);break;case ut.KHR_TEXTURE_TRANSFORM:o[u]=new Fh;break;case ut.KHR_MESH_QUANTIZATION:o[u]=new Bh;break;default:d.indexOf(u)>=0&&a[u]===void 0&&console.warn('THREE.GLTFLoader: Unknown extension "'+u+'".')}}l.setExtensions(o),l.setPlugins(a),l.parse(n,i)}parseAsync(e,t){let n=this;return new Promise(function(i,r){n.parse(e,t,i,r)})}};function ey(){let s={};return{get:function(e){return s[e]},add:function(e,t){s[e]=t},remove:function(e){delete s[e]},removeAll:function(){s={}}}}var ut={KHR_BINARY_GLTF:"KHR_binary_glTF",KHR_DRACO_MESH_COMPRESSION:"KHR_draco_mesh_compression",KHR_LIGHTS_PUNCTUAL:"KHR_lights_punctual",KHR_MATERIALS_CLEARCOAT:"KHR_materials_clearcoat",KHR_MATERIALS_DISPERSION:"KHR_materials_dispersion",KHR_MATERIALS_IOR:"KHR_materials_ior",KHR_MATERIALS_SHEEN:"KHR_materials_sheen",KHR_MATERIALS_SPECULAR:"KHR_materials_specular",KHR_MATERIALS_TRANSMISSION:"KHR_materials_transmission",KHR_MATERIALS_IRIDESCENCE:"KHR_materials_iridescence",KHR_MATERIALS_ANISOTROPY:"KHR_materials_anisotropy",KHR_MATERIALS_UNLIT:"KHR_materials_unlit",KHR_MATERIALS_VOLUME:"KHR_materials_volume",KHR_TEXTURE_BASISU:"KHR_texture_basisu",KHR_TEXTURE_TRANSFORM:"KHR_texture_transform",KHR_MESH_QUANTIZATION:"KHR_mesh_quantization",KHR_MATERIALS_EMISSIVE_STRENGTH:"KHR_materials_emissive_strength",EXT_MATERIALS_BUMP:"EXT_materials_bump",EXT_TEXTURE_WEBP:"EXT_texture_webp",EXT_TEXTURE_AVIF:"EXT_texture_avif",EXT_MESHOPT_COMPRESSION:"EXT_meshopt_compression",EXT_MESH_GPU_INSTANCING:"EXT_mesh_gpu_instancing"},gh=class{constructor(e){this.parser=e,this.name=ut.KHR_LIGHTS_PUNCTUAL,this.cache={refs:{},uses:{}}}_markDefs(){let e=this.parser,t=this.parser.json.nodes||[];for(let n=0,i=t.length;n<i;n++){let r=t[n];r.extensions&&r.extensions[this.name]&&r.extensions[this.name].light!==void 0&&e._addNodeRef(this.cache,r.extensions[this.name].light)}}_loadLight(e){let t=this.parser,n="light:"+e,i=t.cache.get(n);if(i)return i;let r=t.json,c=((r.extensions&&r.extensions[this.name]||{}).lights||[])[e],l,h=new ge(16777215);c.color!==void 0&&h.setRGB(c.color[0],c.color[1],c.color[2],Jt);let u=c.range!==void 0?c.range:0;switch(c.type){case"directional":l=new ui(h),l.target.position.set(0,0,-1),l.add(l.target);break;case"point":l=new Rs(h),l.distance=u;break;case"spot":l=new ws(h),l.distance=u,c.spot=c.spot||{},c.spot.innerConeAngle=c.spot.innerConeAngle!==void 0?c.spot.innerConeAngle:0,c.spot.outerConeAngle=c.spot.outerConeAngle!==void 0?c.spot.outerConeAngle:Math.PI/4,l.angle=c.spot.outerConeAngle,l.penumbra=1-c.spot.innerConeAngle/c.spot.outerConeAngle,l.target.position.set(0,0,-1),l.add(l.target);break;default:throw new Error("THREE.GLTFLoader: Unexpected light type: "+c.type)}return l.position.set(0,0,0),Bi(l,c),c.intensity!==void 0&&(l.intensity=c.intensity),l.name=t.createUniqueName(c.name||"light_"+e),i=Promise.resolve(l),t.cache.add(n,i),i}getDependency(e,t){if(e==="light")return this._loadLight(t)}createNodeAttachment(e){let t=this,n=this.parser,r=n.json.nodes[e],a=(r.extensions&&r.extensions[this.name]||{}).light;return a===void 0?null:this._loadLight(a).then(function(c){return n._getNodeRef(t.cache,a,c)})}},_h=class{constructor(){this.name=ut.KHR_MATERIALS_UNLIT}getMaterialType(){return wt}extendParams(e,t,n){let i=[];e.color=new ge(1,1,1),e.opacity=1;let r=t.pbrMetallicRoughness;if(r){if(Array.isArray(r.baseColorFactor)){let o=r.baseColorFactor;e.color.setRGB(o[0],o[1],o[2],Jt),e.opacity=o[3]}r.baseColorTexture!==void 0&&i.push(n.assignTexture(e,"map",r.baseColorTexture,ct))}return Promise.all(i)}},xh=class{constructor(e){this.parser=e,this.name=ut.KHR_MATERIALS_EMISSIVE_STRENGTH}extendMaterialParams(e,t){let i=this.parser.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=i.extensions[this.name].emissiveStrength;return r!==void 0&&(t.emissiveIntensity=r),Promise.resolve()}},yh=class{constructor(e){this.parser=e,this.name=ut.KHR_MATERIALS_CLEARCOAT}getMaterialType(e){let n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:wn}extendMaterialParams(e,t){let n=this.parser,i=n.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=[],o=i.extensions[this.name];if(o.clearcoatFactor!==void 0&&(t.clearcoat=o.clearcoatFactor),o.clearcoatTexture!==void 0&&r.push(n.assignTexture(t,"clearcoatMap",o.clearcoatTexture)),o.clearcoatRoughnessFactor!==void 0&&(t.clearcoatRoughness=o.clearcoatRoughnessFactor),o.clearcoatRoughnessTexture!==void 0&&r.push(n.assignTexture(t,"clearcoatRoughnessMap",o.clearcoatRoughnessTexture)),o.clearcoatNormalTexture!==void 0&&(r.push(n.assignTexture(t,"clearcoatNormalMap",o.clearcoatNormalTexture)),o.clearcoatNormalTexture.scale!==void 0)){let a=o.clearcoatNormalTexture.scale;t.clearcoatNormalScale=new ke(a,a)}return Promise.all(r)}},vh=class{constructor(e){this.parser=e,this.name=ut.KHR_MATERIALS_DISPERSION}getMaterialType(e){let n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:wn}extendMaterialParams(e,t){let i=this.parser.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=i.extensions[this.name];return t.dispersion=r.dispersion!==void 0?r.dispersion:0,Promise.resolve()}},Mh=class{constructor(e){this.parser=e,this.name=ut.KHR_MATERIALS_IRIDESCENCE}getMaterialType(e){let n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:wn}extendMaterialParams(e,t){let n=this.parser,i=n.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=[],o=i.extensions[this.name];return o.iridescenceFactor!==void 0&&(t.iridescence=o.iridescenceFactor),o.iridescenceTexture!==void 0&&r.push(n.assignTexture(t,"iridescenceMap",o.iridescenceTexture)),o.iridescenceIor!==void 0&&(t.iridescenceIOR=o.iridescenceIor),t.iridescenceThicknessRange===void 0&&(t.iridescenceThicknessRange=[100,400]),o.iridescenceThicknessMinimum!==void 0&&(t.iridescenceThicknessRange[0]=o.iridescenceThicknessMinimum),o.iridescenceThicknessMaximum!==void 0&&(t.iridescenceThicknessRange[1]=o.iridescenceThicknessMaximum),o.iridescenceThicknessTexture!==void 0&&r.push(n.assignTexture(t,"iridescenceThicknessMap",o.iridescenceThicknessTexture)),Promise.all(r)}},bh=class{constructor(e){this.parser=e,this.name=ut.KHR_MATERIALS_SHEEN}getMaterialType(e){let n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:wn}extendMaterialParams(e,t){let n=this.parser,i=n.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=[];t.sheenColor=new ge(0,0,0),t.sheenRoughness=0,t.sheen=1;let o=i.extensions[this.name];if(o.sheenColorFactor!==void 0){let a=o.sheenColorFactor;t.sheenColor.setRGB(a[0],a[1],a[2],Jt)}return o.sheenRoughnessFactor!==void 0&&(t.sheenRoughness=o.sheenRoughnessFactor),o.sheenColorTexture!==void 0&&r.push(n.assignTexture(t,"sheenColorMap",o.sheenColorTexture,ct)),o.sheenRoughnessTexture!==void 0&&r.push(n.assignTexture(t,"sheenRoughnessMap",o.sheenRoughnessTexture)),Promise.all(r)}},Sh=class{constructor(e){this.parser=e,this.name=ut.KHR_MATERIALS_TRANSMISSION}getMaterialType(e){let n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:wn}extendMaterialParams(e,t){let n=this.parser,i=n.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=[],o=i.extensions[this.name];return o.transmissionFactor!==void 0&&(t.transmission=o.transmissionFactor),o.transmissionTexture!==void 0&&r.push(n.assignTexture(t,"transmissionMap",o.transmissionTexture)),Promise.all(r)}},Eh=class{constructor(e){this.parser=e,this.name=ut.KHR_MATERIALS_VOLUME}getMaterialType(e){let n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:wn}extendMaterialParams(e,t){let n=this.parser,i=n.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=[],o=i.extensions[this.name];t.thickness=o.thicknessFactor!==void 0?o.thicknessFactor:0,o.thicknessTexture!==void 0&&r.push(n.assignTexture(t,"thicknessMap",o.thicknessTexture)),t.attenuationDistance=o.attenuationDistance||1/0;let a=o.attenuationColor||[1,1,1];return t.attenuationColor=new ge().setRGB(a[0],a[1],a[2],Jt),Promise.all(r)}},Th=class{constructor(e){this.parser=e,this.name=ut.KHR_MATERIALS_IOR}getMaterialType(e){let n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:wn}extendMaterialParams(e,t){let i=this.parser.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=i.extensions[this.name];return t.ior=r.ior!==void 0?r.ior:1.5,Promise.resolve()}},Ah=class{constructor(e){this.parser=e,this.name=ut.KHR_MATERIALS_SPECULAR}getMaterialType(e){let n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:wn}extendMaterialParams(e,t){let n=this.parser,i=n.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=[],o=i.extensions[this.name];t.specularIntensity=o.specularFactor!==void 0?o.specularFactor:1,o.specularTexture!==void 0&&r.push(n.assignTexture(t,"specularIntensityMap",o.specularTexture));let a=o.specularColorFactor||[1,1,1];return t.specularColor=new ge().setRGB(a[0],a[1],a[2],Jt),o.specularColorTexture!==void 0&&r.push(n.assignTexture(t,"specularColorMap",o.specularColorTexture,ct)),Promise.all(r)}},wh=class{constructor(e){this.parser=e,this.name=ut.EXT_MATERIALS_BUMP}getMaterialType(e){let n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:wn}extendMaterialParams(e,t){let n=this.parser,i=n.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=[],o=i.extensions[this.name];return t.bumpScale=o.bumpFactor!==void 0?o.bumpFactor:1,o.bumpTexture!==void 0&&r.push(n.assignTexture(t,"bumpMap",o.bumpTexture)),Promise.all(r)}},Rh=class{constructor(e){this.parser=e,this.name=ut.KHR_MATERIALS_ANISOTROPY}getMaterialType(e){let n=this.parser.json.materials[e];return!n.extensions||!n.extensions[this.name]?null:wn}extendMaterialParams(e,t){let n=this.parser,i=n.json.materials[e];if(!i.extensions||!i.extensions[this.name])return Promise.resolve();let r=[],o=i.extensions[this.name];return o.anisotropyStrength!==void 0&&(t.anisotropy=o.anisotropyStrength),o.anisotropyRotation!==void 0&&(t.anisotropyRotation=o.anisotropyRotation),o.anisotropyTexture!==void 0&&r.push(n.assignTexture(t,"anisotropyMap",o.anisotropyTexture)),Promise.all(r)}},Ch=class{constructor(e){this.parser=e,this.name=ut.KHR_TEXTURE_BASISU}loadTexture(e){let t=this.parser,n=t.json,i=n.textures[e];if(!i.extensions||!i.extensions[this.name])return null;let r=i.extensions[this.name],o=t.options.ktx2Loader;if(!o){if(n.extensionsRequired&&n.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures");return null}return t.loadTextureImage(e,r.source,o)}},Ih=class{constructor(e){this.parser=e,this.name=ut.EXT_TEXTURE_WEBP,this.isSupported=null}loadTexture(e){let t=this.name,n=this.parser,i=n.json,r=i.textures[e];if(!r.extensions||!r.extensions[t])return null;let o=r.extensions[t],a=i.images[o.source],c=n.textureLoader;if(a.uri){let l=n.options.manager.getHandler(a.uri);l!==null&&(c=l)}return this.detectSupport().then(function(l){if(l)return n.loadTextureImage(e,o.source,c);if(i.extensionsRequired&&i.extensionsRequired.indexOf(t)>=0)throw new Error("THREE.GLTFLoader: WebP required by asset but unsupported.");return n.loadTexture(e)})}detectSupport(){return this.isSupported||(this.isSupported=new Promise(function(e){let t=new Image;t.src="data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA",t.onload=t.onerror=function(){e(t.height===1)}})),this.isSupported}},Ph=class{constructor(e){this.parser=e,this.name=ut.EXT_TEXTURE_AVIF,this.isSupported=null}loadTexture(e){let t=this.name,n=this.parser,i=n.json,r=i.textures[e];if(!r.extensions||!r.extensions[t])return null;let o=r.extensions[t],a=i.images[o.source],c=n.textureLoader;if(a.uri){let l=n.options.manager.getHandler(a.uri);l!==null&&(c=l)}return this.detectSupport().then(function(l){if(l)return n.loadTextureImage(e,o.source,c);if(i.extensionsRequired&&i.extensionsRequired.indexOf(t)>=0)throw new Error("THREE.GLTFLoader: AVIF required by asset but unsupported.");return n.loadTexture(e)})}detectSupport(){return this.isSupported||(this.isSupported=new Promise(function(e){let t=new Image;t.src="data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAABcAAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAEAAAABAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQAMAAAAABNjb2xybmNseAACAAIABoAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAAB9tZGF0EgAKCBgABogQEDQgMgkQAAAAB8dSLfI=",t.onload=t.onerror=function(){e(t.height===1)}})),this.isSupported}},Lh=class{constructor(e){this.name=ut.EXT_MESHOPT_COMPRESSION,this.parser=e}loadBufferView(e){let t=this.parser.json,n=t.bufferViews[e];if(n.extensions&&n.extensions[this.name]){let i=n.extensions[this.name],r=this.parser.getDependency("buffer",i.buffer),o=this.parser.options.meshoptDecoder;if(!o||!o.supported){if(t.extensionsRequired&&t.extensionsRequired.indexOf(this.name)>=0)throw new Error("THREE.GLTFLoader: setMeshoptDecoder must be called before loading compressed files");return null}return r.then(function(a){let c=i.byteOffset||0,l=i.byteLength||0,h=i.count,u=i.byteStride,d=new Uint8Array(a,c,l);return o.decodeGltfBufferAsync?o.decodeGltfBufferAsync(h,u,d,i.mode,i.filter).then(function(p){return p.buffer}):o.ready.then(function(){let p=new ArrayBuffer(h*u);return o.decodeGltfBuffer(new Uint8Array(p),h,u,d,i.mode,i.filter),p})})}else return null}},Dh=class{constructor(e){this.name=ut.EXT_MESH_GPU_INSTANCING,this.parser=e}createNodeMesh(e){let t=this.parser.json,n=t.nodes[e];if(!n.extensions||!n.extensions[this.name]||n.mesh===void 0)return null;let i=t.meshes[n.mesh];for(let l of i.primitives)if(l.mode!==On.TRIANGLES&&l.mode!==On.TRIANGLE_STRIP&&l.mode!==On.TRIANGLE_FAN&&l.mode!==void 0)return null;let o=n.extensions[this.name].attributes,a=[],c={};for(let l in o)a.push(this.parser.getDependency("accessor",o[l]).then(h=>(c[l]=h,c[l])));return a.length<1?null:(a.push(this.parser.createNodeMesh(e)),Promise.all(a).then(l=>{let h=l.pop(),u=h.isGroup?h.children:[h],d=l[0].count,p=[];for(let g of u){let _=new Ze,m=new D,f=new Tn,v=new D(1,1,1),S=new Fn(g.geometry,g.material,d);for(let x=0;x<d;x++)c.TRANSLATION&&m.fromBufferAttribute(c.TRANSLATION,x),c.ROTATION&&f.fromBufferAttribute(c.ROTATION,x),c.SCALE&&v.fromBufferAttribute(c.SCALE,x),S.setMatrixAt(x,_.compose(m,f,v));for(let x in c)if(x==="_COLOR_0"){let P=c[x];S.instanceColor=new ji(P.array,P.itemSize,P.normalized)}else x!=="TRANSLATION"&&x!=="ROTATION"&&x!=="SCALE"&&g.geometry.setAttribute(x,c[x]);St.prototype.copy.call(S,g),this.parser.assignFinalMaterial(S),p.push(S)}return h.isGroup?(h.clear(),h.add(...p),h):p[0]}))}},bf="glTF",wo=12,xf={JSON:1313821514,BIN:5130562},Uh=class{constructor(e){this.name=ut.KHR_BINARY_GLTF,this.content=null,this.body=null;let t=new DataView(e,0,wo),n=new TextDecoder;if(this.header={magic:n.decode(new Uint8Array(e.slice(0,4))),version:t.getUint32(4,!0),length:t.getUint32(8,!0)},this.header.magic!==bf)throw new Error("THREE.GLTFLoader: Unsupported glTF-Binary header.");if(this.header.version<2)throw new Error("THREE.GLTFLoader: Legacy binary file detected.");let i=this.header.length-wo,r=new DataView(e,wo),o=0;for(;o<i;){let a=r.getUint32(o,!0);o+=4;let c=r.getUint32(o,!0);if(o+=4,c===xf.JSON){let l=new Uint8Array(e,wo+o,a);this.content=n.decode(l)}else if(c===xf.BIN){let l=wo+o;this.body=e.slice(l,l+a)}o+=a}if(this.content===null)throw new Error("THREE.GLTFLoader: JSON content not found.")}},Nh=class{constructor(e,t){if(!t)throw new Error("THREE.GLTFLoader: No DRACOLoader instance provided.");this.name=ut.KHR_DRACO_MESH_COMPRESSION,this.json=e,this.dracoLoader=t,this.dracoLoader.preload()}decodePrimitive(e,t){let n=this.json,i=this.dracoLoader,r=e.extensions[this.name].bufferView,o=e.extensions[this.name].attributes,a={},c={},l={};for(let h in o){let u=zh[h]||h.toLowerCase();a[u]=o[h]}for(let h in e.attributes){let u=zh[h]||h.toLowerCase();if(o[h]!==void 0){let d=n.accessors[e.attributes[h]],p=Sr[d.componentType];l[u]=p.name,c[u]=d.normalized===!0}}return t.getDependency("bufferView",r).then(function(h){return new Promise(function(u,d){i.decodeDracoFile(h,function(p){for(let g in p.attributes){let _=p.attributes[g],m=c[g];m!==void 0&&(_.normalized=m)}u(p)},a,l,Jt,d)})})}},Fh=class{constructor(){this.name=ut.KHR_TEXTURE_TRANSFORM}extendTexture(e,t){return(t.texCoord===void 0||t.texCoord===e.channel)&&t.offset===void 0&&t.rotation===void 0&&t.scale===void 0||(e=e.clone(),t.texCoord!==void 0&&(e.channel=t.texCoord),t.offset!==void 0&&e.offset.fromArray(t.offset),t.rotation!==void 0&&(e.rotation=t.rotation),t.scale!==void 0&&e.repeat.fromArray(t.scale),e.needsUpdate=!0),e}},Bh=class{constructor(){this.name=ut.KHR_MESH_QUANTIZATION}},Tc=class extends Ii{constructor(e,t,n,i){super(e,t,n,i)}copySampleValue_(e){let t=this.resultBuffer,n=this.sampleValues,i=this.valueSize,r=e*i*3+i;for(let o=0;o!==i;o++)t[o]=n[r+o];return t}interpolate_(e,t,n,i){let r=this.resultBuffer,o=this.sampleValues,a=this.valueSize,c=a*2,l=a*3,h=i-t,u=(n-t)/h,d=u*u,p=d*u,g=e*l,_=g-l,m=-2*p+3*d,f=p-d,v=1-m,S=f-d+u;for(let x=0;x!==a;x++){let P=o[_+x+a],T=o[_+x+c]*h,w=o[g+x+a],R=o[g+x]*h;r[x]=v*P+S*T+m*w+f*R}return r}},ty=new Tn,Oh=class extends Tc{interpolate_(e,t,n,i){let r=super.interpolate_(e,t,n,i);return ty.fromArray(r).normalize().toArray(r),r}},On={FLOAT:5126,FLOAT_MAT3:35675,FLOAT_MAT4:35676,FLOAT_VEC2:35664,FLOAT_VEC3:35665,FLOAT_VEC4:35666,LINEAR:9729,REPEAT:10497,SAMPLER_2D:35678,POINTS:0,LINES:1,LINE_LOOP:2,LINE_STRIP:3,TRIANGLES:4,TRIANGLE_STRIP:5,TRIANGLE_FAN:6,UNSIGNED_BYTE:5121,UNSIGNED_SHORT:5123},Sr={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},yf={9728:ln,9729:Nt,9984:za,9985:mr,9986:Ds,9987:Bn},vf={33071:Mn,33648:cr,10497:bt},fh={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16},zh={POSITION:"position",NORMAL:"normal",TANGENT:"tangent",TEXCOORD_0:"uv",TEXCOORD_1:"uv1",TEXCOORD_2:"uv2",TEXCOORD_3:"uv3",COLOR_0:"color",WEIGHTS_0:"skinWeight",JOINTS_0:"skinIndex"},ns={scale:"scale",translation:"position",rotation:"quaternion",weights:"morphTargetInfluences"},ny={CUBICSPLINE:void 0,LINEAR:gs,STEP:ms},ph={OPAQUE:"OPAQUE",MASK:"MASK",BLEND:"BLEND"};function iy(s){return s.DefaultMaterial===void 0&&(s.DefaultMaterial=new Rt({color:16777215,emissive:0,metalness:1,roughness:1,transparent:!1,depthTest:!0,side:Zn})),s.DefaultMaterial}function Hs(s,e,t){for(let n in t.extensions)s[n]===void 0&&(e.userData.gltfExtensions=e.userData.gltfExtensions||{},e.userData.gltfExtensions[n]=t.extensions[n])}function Bi(s,e){e.extras!==void 0&&(typeof e.extras=="object"?Object.assign(s.userData,e.extras):console.warn("THREE.GLTFLoader: Ignoring primitive type .extras, "+e.extras))}function sy(s,e,t){let n=!1,i=!1,r=!1;for(let l=0,h=e.length;l<h;l++){let u=e[l];if(u.POSITION!==void 0&&(n=!0),u.NORMAL!==void 0&&(i=!0),u.COLOR_0!==void 0&&(r=!0),n&&i&&r)break}if(!n&&!i&&!r)return Promise.resolve(s);let o=[],a=[],c=[];for(let l=0,h=e.length;l<h;l++){let u=e[l];if(n){let d=u.POSITION!==void 0?t.getDependency("accessor",u.POSITION):s.attributes.position;o.push(d)}if(i){let d=u.NORMAL!==void 0?t.getDependency("accessor",u.NORMAL):s.attributes.normal;a.push(d)}if(r){let d=u.COLOR_0!==void 0?t.getDependency("accessor",u.COLOR_0):s.attributes.color;c.push(d)}}return Promise.all([Promise.all(o),Promise.all(a),Promise.all(c)]).then(function(l){let h=l[0],u=l[1],d=l[2];return n&&(s.morphAttributes.position=h),i&&(s.morphAttributes.normal=u),r&&(s.morphAttributes.color=d),s.morphTargetsRelative=!0,s})}function ry(s,e){if(s.updateMorphTargets(),e.weights!==void 0)for(let t=0,n=e.weights.length;t<n;t++)s.morphTargetInfluences[t]=e.weights[t];if(e.extras&&Array.isArray(e.extras.targetNames)){let t=e.extras.targetNames;if(s.morphTargetInfluences.length===t.length){s.morphTargetDictionary={};for(let n=0,i=t.length;n<i;n++)s.morphTargetDictionary[t[n]]=n}else console.warn("THREE.GLTFLoader: Invalid extras.targetNames length. Ignoring names.")}}function oy(s){let e,t=s.extensions&&s.extensions[ut.KHR_DRACO_MESH_COMPRESSION];if(t?e="draco:"+t.bufferView+":"+t.indices+":"+mh(t.attributes):e=s.indices+":"+mh(s.attributes)+":"+s.mode,s.targets!==void 0)for(let n=0,i=s.targets.length;n<i;n++)e+=":"+mh(s.targets[n]);return e}function mh(s){let e="",t=Object.keys(s).sort();for(let n=0,i=t.length;n<i;n++)e+=t[n]+":"+s[t[n]]+";";return e}function Hh(s){switch(s){case Int8Array:return 1/127;case Uint8Array:return 1/255;case Int16Array:return 1/32767;case Uint16Array:return 1/65535;default:throw new Error("THREE.GLTFLoader: Unsupported normalized accessor component type.")}}function ay(s){return s.search(/\.jpe?g($|\?)/i)>0||s.search(/^data\:image\/jpeg/)===0?"image/jpeg":s.search(/\.webp($|\?)/i)>0||s.search(/^data\:image\/webp/)===0?"image/webp":s.search(/\.ktx2($|\?)/i)>0||s.search(/^data\:image\/ktx2/)===0?"image/ktx2":"image/png"}var cy=new Ze,kh=class{constructor(e={},t={}){this.json=e,this.extensions={},this.plugins={},this.options=t,this.cache=new ey,this.associations=new Map,this.primitiveCache={},this.nodeCache={},this.meshCache={refs:{},uses:{}},this.cameraCache={refs:{},uses:{}},this.lightCache={refs:{},uses:{}},this.sourceCache={},this.textureCache={},this.nodeNamesUsed={};let n=!1,i=-1,r=!1,o=-1;if(typeof navigator<"u"){let a=navigator.userAgent;n=/^((?!chrome|android).)*safari/i.test(a)===!0;let c=a.match(/Version\/(\d+)/);i=n&&c?parseInt(c[1],10):-1,r=a.indexOf("Firefox")>-1,o=r?a.match(/Firefox\/([0-9]+)\./)[1]:-1}typeof createImageBitmap>"u"||n&&i<17||r&&o<98?this.textureLoader=new Ts(this.options.manager):this.textureLoader=new xo(this.options.manager),this.textureLoader.setCrossOrigin(this.options.crossOrigin),this.textureLoader.setRequestHeader(this.options.requestHeader),this.fileLoader=new Es(this.options.manager),this.fileLoader.setResponseType("arraybuffer"),this.options.crossOrigin==="use-credentials"&&this.fileLoader.setWithCredentials(!0)}setExtensions(e){this.extensions=e}setPlugins(e){this.plugins=e}parse(e,t){let n=this,i=this.json,r=this.extensions;this.cache.removeAll(),this.nodeCache={},this._invokeAll(function(o){return o._markDefs&&o._markDefs()}),Promise.all(this._invokeAll(function(o){return o.beforeRoot&&o.beforeRoot()})).then(function(){return Promise.all([n.getDependencies("scene"),n.getDependencies("animation"),n.getDependencies("camera")])}).then(function(o){let a={scene:o[0][i.scene||0],scenes:o[0],animations:o[1],cameras:o[2],asset:i.asset,parser:n,userData:{}};return Hs(r,a,i),Bi(a,i),Promise.all(n._invokeAll(function(c){return c.afterRoot&&c.afterRoot(a)})).then(function(){for(let c of a.scenes)c.updateMatrixWorld();e(a)})}).catch(t)}_markDefs(){let e=this.json.nodes||[],t=this.json.skins||[],n=this.json.meshes||[];for(let i=0,r=t.length;i<r;i++){let o=t[i].joints;for(let a=0,c=o.length;a<c;a++)e[o[a]].isBone=!0}for(let i=0,r=e.length;i<r;i++){let o=e[i];o.mesh!==void 0&&(this._addNodeRef(this.meshCache,o.mesh),o.skin!==void 0&&(n[o.mesh].isSkinnedMesh=!0)),o.camera!==void 0&&this._addNodeRef(this.cameraCache,o.camera)}}_addNodeRef(e,t){t!==void 0&&(e.refs[t]===void 0&&(e.refs[t]=e.uses[t]=0),e.refs[t]++)}_getNodeRef(e,t,n){if(e.refs[t]<=1)return n;let i=n.clone(),r=(o,a)=>{let c=this.associations.get(o);c!=null&&this.associations.set(a,c);for(let[l,h]of o.children.entries())r(h,a.children[l])};return r(n,i),i.name+="_instance_"+e.uses[t]++,i}_invokeOne(e){let t=Object.values(this.plugins);t.push(this);for(let n=0;n<t.length;n++){let i=e(t[n]);if(i)return i}return null}_invokeAll(e){let t=Object.values(this.plugins);t.unshift(this);let n=[];for(let i=0;i<t.length;i++){let r=e(t[i]);r&&n.push(r)}return n}getDependency(e,t){let n=e+":"+t,i=this.cache.get(n);if(!i){switch(e){case"scene":i=this.loadScene(t);break;case"node":i=this._invokeOne(function(r){return r.loadNode&&r.loadNode(t)});break;case"mesh":i=this._invokeOne(function(r){return r.loadMesh&&r.loadMesh(t)});break;case"accessor":i=this.loadAccessor(t);break;case"bufferView":i=this._invokeOne(function(r){return r.loadBufferView&&r.loadBufferView(t)});break;case"buffer":i=this.loadBuffer(t);break;case"material":i=this._invokeOne(function(r){return r.loadMaterial&&r.loadMaterial(t)});break;case"texture":i=this._invokeOne(function(r){return r.loadTexture&&r.loadTexture(t)});break;case"skin":i=this.loadSkin(t);break;case"animation":i=this._invokeOne(function(r){return r.loadAnimation&&r.loadAnimation(t)});break;case"camera":i=this.loadCamera(t);break;default:if(i=this._invokeOne(function(r){return r!=this&&r.getDependency&&r.getDependency(e,t)}),!i)throw new Error("Unknown type: "+e);break}this.cache.add(n,i)}return i}getDependencies(e){let t=this.cache.get(e);if(!t){let n=this,i=this.json[e+(e==="mesh"?"es":"s")]||[];t=Promise.all(i.map(function(r,o){return n.getDependency(e,o)})),this.cache.add(e,t)}return t}loadBuffer(e){let t=this.json.buffers[e],n=this.fileLoader;if(t.type&&t.type!=="arraybuffer")throw new Error("THREE.GLTFLoader: "+t.type+" buffer type is not supported.");if(t.uri===void 0&&e===0)return Promise.resolve(this.extensions[ut.KHR_BINARY_GLTF].body);let i=this.options;return new Promise(function(r,o){n.load(Di.resolveURL(t.uri,i.path),r,void 0,function(){o(new Error('THREE.GLTFLoader: Failed to load buffer "'+t.uri+'".'))})})}loadBufferView(e){let t=this.json.bufferViews[e];return this.getDependency("buffer",t.buffer).then(function(n){let i=t.byteLength||0,r=t.byteOffset||0;return n.slice(r,r+i)})}loadAccessor(e){let t=this,n=this.json,i=this.json.accessors[e];if(i.bufferView===void 0&&i.sparse===void 0){let o=fh[i.type],a=Sr[i.componentType],c=i.normalized===!0,l=new a(i.count*o);return Promise.resolve(new xt(l,o,c))}let r=[];return i.bufferView!==void 0?r.push(this.getDependency("bufferView",i.bufferView)):r.push(null),i.sparse!==void 0&&(r.push(this.getDependency("bufferView",i.sparse.indices.bufferView)),r.push(this.getDependency("bufferView",i.sparse.values.bufferView))),Promise.all(r).then(function(o){let a=o[0],c=fh[i.type],l=Sr[i.componentType],h=l.BYTES_PER_ELEMENT,u=h*c,d=i.byteOffset||0,p=i.bufferView!==void 0?n.bufferViews[i.bufferView].byteStride:void 0,g=i.normalized===!0,_,m;if(p&&p!==u){let f=Math.floor(d/p),v="InterleavedBuffer:"+i.bufferView+":"+i.componentType+":"+f+":"+i.count,S=t.cache.get(v);S||(_=new l(a,f*p,i.count*p/h),S=new vs(_,p/h),t.cache.add(v,S)),m=new Ki(S,c,d%p/h,g)}else a===null?_=new l(i.count*c):_=new l(a,d,i.count*c),m=new xt(_,c,g);if(i.sparse!==void 0){let f=fh.SCALAR,v=Sr[i.sparse.indices.componentType],S=i.sparse.indices.byteOffset||0,x=i.sparse.values.byteOffset||0,P=new v(o[1],S,i.sparse.count*f),T=new l(o[2],x,i.sparse.count*c);a!==null&&(m=new xt(m.array.slice(),m.itemSize,m.normalized)),m.normalized=!1;for(let w=0,R=P.length;w<R;w++){let M=P[w];if(m.setX(M,T[w*c]),c>=2&&m.setY(M,T[w*c+1]),c>=3&&m.setZ(M,T[w*c+2]),c>=4&&m.setW(M,T[w*c+3]),c>=5)throw new Error("THREE.GLTFLoader: Unsupported itemSize in sparse BufferAttribute.")}m.normalized=g}return m})}loadTexture(e){let t=this.json,n=this.options,r=t.textures[e].source,o=t.images[r],a=this.textureLoader;if(o.uri){let c=n.manager.getHandler(o.uri);c!==null&&(a=c)}return this.loadTextureImage(e,r,a)}loadTextureImage(e,t,n){let i=this,r=this.json,o=r.textures[e],a=r.images[t],c=(a.uri||a.bufferView)+":"+o.sampler;if(this.textureCache[c])return this.textureCache[c];let l=this.loadImageSource(t,n).then(function(h){h.flipY=!1,h.name=o.name||a.name||"",h.name===""&&typeof a.uri=="string"&&a.uri.startsWith("data:image/")===!1&&(h.name=a.uri);let d=(r.samplers||{})[o.sampler]||{};return h.magFilter=yf[d.magFilter]||Nt,h.minFilter=yf[d.minFilter]||Bn,h.wrapS=vf[d.wrapS]||bt,h.wrapT=vf[d.wrapT]||bt,h.generateMipmaps=!h.isCompressedTexture&&h.minFilter!==ln&&h.minFilter!==Nt,i.associations.set(h,{textures:e}),h}).catch(function(){return null});return this.textureCache[c]=l,l}loadImageSource(e,t){let n=this,i=this.json,r=this.options;if(this.sourceCache[e]!==void 0)return this.sourceCache[e].then(u=>u.clone());let o=i.images[e],a=self.URL||self.webkitURL,c=o.uri||"",l=!1;if(o.bufferView!==void 0)c=n.getDependency("bufferView",o.bufferView).then(function(u){l=!0;let d=new Blob([u],{type:o.mimeType});return c=a.createObjectURL(d),c});else if(o.uri===void 0)throw new Error("THREE.GLTFLoader: Image "+e+" is missing URI and bufferView");let h=Promise.resolve(c).then(function(u){return new Promise(function(d,p){let g=d;t.isImageBitmapLoader===!0&&(g=function(_){let m=new $t(_);m.needsUpdate=!0,d(m)}),t.load(Di.resolveURL(u,r.path),g,void 0,p)})}).then(function(u){return l===!0&&a.revokeObjectURL(c),Bi(u,o),u.userData.mimeType=o.mimeType||ay(o.uri),u}).catch(function(u){throw console.error("THREE.GLTFLoader: Couldn't load texture",c),u});return this.sourceCache[e]=h,h}assignTexture(e,t,n,i){let r=this;return this.getDependency("texture",n.index).then(function(o){if(!o)return null;if(n.texCoord!==void 0&&n.texCoord>0&&(o=o.clone(),o.channel=n.texCoord),r.extensions[ut.KHR_TEXTURE_TRANSFORM]){let a=n.extensions!==void 0?n.extensions[ut.KHR_TEXTURE_TRANSFORM]:void 0;if(a){let c=r.associations.get(o);o=r.extensions[ut.KHR_TEXTURE_TRANSFORM].extendTexture(o,a),r.associations.set(o,c)}}return i!==void 0&&(o.colorSpace=i),e[t]=o,o})}assignFinalMaterial(e){let t=e.geometry,n=e.material,i=t.attributes.tangent===void 0,r=t.attributes.color!==void 0,o=t.attributes.normal===void 0;if(e.isPoints){let a="PointsMaterial:"+n.uuid,c=this.cache.get(a);c||(c=new Qi,bn.prototype.copy.call(c,n),c.color.copy(n.color),c.map=n.map,c.sizeAttenuation=!1,this.cache.add(a,c)),n=c}else if(e.isLine){let a="LineBasicMaterial:"+n.uuid,c=this.cache.get(a);c||(c=new pr,bn.prototype.copy.call(c,n),c.color.copy(n.color),c.map=n.map,this.cache.add(a,c)),n=c}if(i||r||o){let a="ClonedMaterial:"+n.uuid+":";i&&(a+="derivative-tangents:"),r&&(a+="vertex-colors:"),o&&(a+="flat-shading:");let c=this.cache.get(a);c||(c=n.clone(),r&&(c.vertexColors=!0),o&&(c.flatShading=!0),i&&(c.normalScale&&(c.normalScale.y*=-1),c.clearcoatNormalScale&&(c.clearcoatNormalScale.y*=-1)),this.cache.add(a,c),this.associations.set(c,this.associations.get(n))),n=c}e.material=n}getMaterialType(){return Rt}loadMaterial(e){let t=this,n=this.json,i=this.extensions,r=n.materials[e],o,a={},c=r.extensions||{},l=[];if(c[ut.KHR_MATERIALS_UNLIT]){let u=i[ut.KHR_MATERIALS_UNLIT];o=u.getMaterialType(),l.push(u.extendParams(a,r,t))}else{let u=r.pbrMetallicRoughness||{};if(a.color=new ge(1,1,1),a.opacity=1,Array.isArray(u.baseColorFactor)){let d=u.baseColorFactor;a.color.setRGB(d[0],d[1],d[2],Jt),a.opacity=d[3]}u.baseColorTexture!==void 0&&l.push(t.assignTexture(a,"map",u.baseColorTexture,ct)),a.metalness=u.metallicFactor!==void 0?u.metallicFactor:1,a.roughness=u.roughnessFactor!==void 0?u.roughnessFactor:1,u.metallicRoughnessTexture!==void 0&&(l.push(t.assignTexture(a,"metalnessMap",u.metallicRoughnessTexture)),l.push(t.assignTexture(a,"roughnessMap",u.metallicRoughnessTexture))),o=this._invokeOne(function(d){return d.getMaterialType&&d.getMaterialType(e)}),l.push(Promise.all(this._invokeAll(function(d){return d.extendMaterialParams&&d.extendMaterialParams(e,a)})))}r.doubleSided===!0&&(a.side=kt);let h=r.alphaMode||ph.OPAQUE;if(h===ph.BLEND?(a.transparent=!0,a.depthWrite=!1):(a.transparent=!1,h===ph.MASK&&(a.alphaTest=r.alphaCutoff!==void 0?r.alphaCutoff:.5)),r.normalTexture!==void 0&&o!==wt&&(l.push(t.assignTexture(a,"normalMap",r.normalTexture)),a.normalScale=new ke(1,1),r.normalTexture.scale!==void 0)){let u=r.normalTexture.scale;a.normalScale.set(u,u)}if(r.occlusionTexture!==void 0&&o!==wt&&(l.push(t.assignTexture(a,"aoMap",r.occlusionTexture)),r.occlusionTexture.strength!==void 0&&(a.aoMapIntensity=r.occlusionTexture.strength)),r.emissiveFactor!==void 0&&o!==wt){let u=r.emissiveFactor;a.emissive=new ge().setRGB(u[0],u[1],u[2],Jt)}return r.emissiveTexture!==void 0&&o!==wt&&l.push(t.assignTexture(a,"emissiveMap",r.emissiveTexture,ct)),Promise.all(l).then(function(){let u=new o(a);return r.name&&(u.name=r.name),Bi(u,r),t.associations.set(u,{materials:e}),r.extensions&&Hs(i,u,r),u})}createUniqueName(e){let t=It.sanitizeNodeName(e||"");return t in this.nodeNamesUsed?t+"_"+ ++this.nodeNamesUsed[t]:(this.nodeNamesUsed[t]=0,t)}loadGeometries(e){let t=this,n=this.extensions,i=this.primitiveCache;function r(a){return n[ut.KHR_DRACO_MESH_COMPRESSION].decodePrimitive(a,t).then(function(c){return Mf(c,a,t)})}let o=[];for(let a=0,c=e.length;a<c;a++){let l=e[a],h=oy(l),u=i[h];if(u)o.push(u.promise);else{let d;l.extensions&&l.extensions[ut.KHR_DRACO_MESH_COMPRESSION]?d=r(l):d=Mf(new Bt,l,t),i[h]={primitive:l,promise:d},o.push(d)}}return Promise.all(o)}loadMesh(e){let t=this,n=this.json,i=this.extensions,r=n.meshes[e],o=r.primitives,a=[];for(let c=0,l=o.length;c<l;c++){let h=o[c].material===void 0?iy(this.cache):this.getDependency("material",o[c].material);a.push(h)}return a.push(t.loadGeometries(o)),Promise.all(a).then(function(c){let l=c.slice(0,c.length-1),h=c[c.length-1],u=[];for(let p=0,g=h.length;p<g;p++){let _=h[p],m=o[p],f,v=l[p];if(m.mode===On.TRIANGLES||m.mode===On.TRIANGLE_STRIP||m.mode===On.TRIANGLE_FAN||m.mode===void 0)f=r.isSkinnedMesh===!0?new eo(_,v):new we(_,v),f.isSkinnedMesh===!0&&f.normalizeSkinWeights(),m.mode===On.TRIANGLE_STRIP?f.geometry=dh(f.geometry,To):m.mode===On.TRIANGLE_FAN&&(f.geometry=dh(f.geometry,_r));else if(m.mode===On.LINES)f=new no(_,v);else if(m.mode===On.LINE_STRIP)f=new bs(_,v);else if(m.mode===On.LINE_LOOP)f=new io(_,v);else if(m.mode===On.POINTS)f=new Ss(_,v);else throw new Error("THREE.GLTFLoader: Primitive mode unsupported: "+m.mode);Object.keys(f.geometry.morphAttributes).length>0&&ry(f,r),f.name=t.createUniqueName(r.name||"mesh_"+e),Bi(f,r),m.extensions&&Hs(i,f,m),t.assignFinalMaterial(f),u.push(f)}for(let p=0,g=u.length;p<g;p++)t.associations.set(u[p],{meshes:e,primitives:p});if(u.length===1)return r.extensions&&Hs(i,u[0],r),u[0];let d=new Pt;r.extensions&&Hs(i,d,r),t.associations.set(d,{meshes:e});for(let p=0,g=u.length;p<g;p++)d.add(u[p]);return d})}loadCamera(e){let t,n=this.json.cameras[e],i=n[n.type];if(!i){console.warn("THREE.GLTFLoader: Missing camera parameters.");return}return n.type==="perspective"?t=new Yt(Xl.radToDeg(i.yfov),i.aspectRatio||1,i.znear||1,i.zfar||2e6):n.type==="orthographic"&&(t=new Cs(-i.xmag,i.xmag,i.ymag,-i.ymag,i.znear,i.zfar)),n.name&&(t.name=this.createUniqueName(n.name)),Bi(t,n),Promise.resolve(t)}loadSkin(e){let t=this.json.skins[e],n=[];for(let i=0,r=t.joints.length;i<r;i++)n.push(this._loadNodeShallow(t.joints[i]));return t.inverseBindMatrices!==void 0?n.push(this.getDependency("accessor",t.inverseBindMatrices)):n.push(null),Promise.all(n).then(function(i){let r=i.pop(),o=i,a=[],c=[];for(let l=0,h=o.length;l<h;l++){let u=o[l];if(u){a.push(u);let d=new Ze;r!==null&&d.fromArray(r.array,l*16),c.push(d)}else console.warn('THREE.GLTFLoader: Joint "%s" could not be found.',t.joints[l])}return new to(a,c)})}loadAnimation(e){let t=this.json,n=this,i=t.animations[e],r=i.name?i.name:"animation_"+e,o=[],a=[],c=[],l=[],h=[];for(let u=0,d=i.channels.length;u<d;u++){let p=i.channels[u],g=i.samplers[p.sampler],_=p.target,m=_.node,f=i.parameters!==void 0?i.parameters[g.input]:g.input,v=i.parameters!==void 0?i.parameters[g.output]:g.output;_.node!==void 0&&(o.push(this.getDependency("node",m)),a.push(this.getDependency("accessor",f)),c.push(this.getDependency("accessor",v)),l.push(g),h.push(_))}return Promise.all([Promise.all(o),Promise.all(a),Promise.all(c),Promise.all(l),Promise.all(h)]).then(function(u){let d=u[0],p=u[1],g=u[2],_=u[3],m=u[4],f=[];for(let v=0,S=d.length;v<S;v++){let x=d[v],P=p[v],T=g[v],w=_[v],R=m[v];if(x===void 0)continue;x.updateMatrix&&x.updateMatrix();let M=n._createAnimationTracks(x,P,T,w,R);if(M)for(let y=0;y<M.length;y++)f.push(M[y])}return new po(r,void 0,f)})}createNodeMesh(e){let t=this.json,n=this,i=t.nodes[e];return i.mesh===void 0?null:n.getDependency("mesh",i.mesh).then(function(r){let o=n._getNodeRef(n.meshCache,i.mesh,r);return i.weights!==void 0&&o.traverse(function(a){if(a.isMesh)for(let c=0,l=i.weights.length;c<l;c++)a.morphTargetInfluences[c]=i.weights[c]}),o})}loadNode(e){let t=this.json,n=this,i=t.nodes[e],r=n._loadNodeShallow(e),o=[],a=i.children||[];for(let l=0,h=a.length;l<h;l++)o.push(n.getDependency("node",a[l]));let c=i.skin===void 0?Promise.resolve(null):n.getDependency("skin",i.skin);return Promise.all([r,Promise.all(o),c]).then(function(l){let h=l[0],u=l[1],d=l[2];d!==null&&h.traverse(function(p){p.isSkinnedMesh&&p.bind(d,cy)});for(let p=0,g=u.length;p<g;p++)h.add(u[p]);return h})}_loadNodeShallow(e){let t=this.json,n=this.extensions,i=this;if(this.nodeCache[e]!==void 0)return this.nodeCache[e];let r=t.nodes[e],o=r.name?i.createUniqueName(r.name):"",a=[],c=i._invokeOne(function(l){return l.createNodeMesh&&l.createNodeMesh(e)});return c&&a.push(c),r.camera!==void 0&&a.push(i.getDependency("camera",r.camera).then(function(l){return i._getNodeRef(i.cameraCache,r.camera,l)})),i._invokeAll(function(l){return l.createNodeAttachment&&l.createNodeAttachment(e)}).forEach(function(l){a.push(l)}),this.nodeCache[e]=Promise.all(a).then(function(l){let h;if(r.isBone===!0?h=new dr:l.length>1?h=new Pt:l.length===1?h=l[0]:h=new St,h!==l[0])for(let u=0,d=l.length;u<d;u++)h.add(l[u]);if(r.name&&(h.userData.name=r.name,h.name=o),Bi(h,r),r.extensions&&Hs(n,h,r),r.matrix!==void 0){let u=new Ze;u.fromArray(r.matrix),h.applyMatrix4(u)}else r.translation!==void 0&&h.position.fromArray(r.translation),r.rotation!==void 0&&h.quaternion.fromArray(r.rotation),r.scale!==void 0&&h.scale.fromArray(r.scale);return i.associations.has(h)||i.associations.set(h,{}),i.associations.get(h).nodes=e,h}),this.nodeCache[e]}loadScene(e){let t=this.extensions,n=this.json.scenes[e],i=this,r=new Pt;n.name&&(r.name=i.createUniqueName(n.name)),Bi(r,n),n.extensions&&Hs(t,r,n);let o=n.nodes||[],a=[];for(let c=0,l=o.length;c<l;c++)a.push(i.getDependency("node",o[c]));return Promise.all(a).then(function(c){for(let h=0,u=c.length;h<u;h++)r.add(c[h]);let l=h=>{let u=new Map;for(let[d,p]of i.associations)(d instanceof bn||d instanceof $t)&&u.set(d,p);return h.traverse(d=>{let p=i.associations.get(d);p!=null&&u.set(d,p)}),u};return i.associations=l(r),r})}_createAnimationTracks(e,t,n,i,r){let o=[],a=e.name?e.name:e.uuid,c=[];ns[r.path]===ns.weights?e.traverse(function(d){d.morphTargetInfluences&&c.push(d.name?d.name:d.uuid)}):c.push(a);let l;switch(ns[r.path]){case ns.weights:l=ci;break;case ns.rotation:l=li;break;case ns.position:case ns.scale:l=hi;break;default:n.itemSize===1?l=ci:l=hi;break}let h=i.interpolation!==void 0?ny[i.interpolation]:gs,u=this._getArrayFromAccessor(n);for(let d=0,p=c.length;d<p;d++){let g=new l(c[d]+"."+ns[r.path],t.array,u,h);i.interpolation==="CUBICSPLINE"&&this._createCubicSplineTrackInterpolant(g),o.push(g)}return o}_getArrayFromAccessor(e){let t=e.array;if(e.normalized){let n=Hh(t.constructor),i=new Float32Array(t.length);for(let r=0,o=t.length;r<o;r++)i[r]=t[r]*n;t=i}return t}_createCubicSplineTrackInterpolant(e){e.createInterpolant=function(n){let i=this instanceof li?Oh:Tc;return new i(this.times,this.values,this.getValueSize()/3,n)},e.createInterpolant.isInterpolantFactoryMethodGLTFCubicSpline=!0}};function ly(s,e,t){let n=e.attributes,i=new rn;if(n.POSITION!==void 0){let a=t.json.accessors[n.POSITION],c=a.min,l=a.max;if(c!==void 0&&l!==void 0){if(i.set(new D(c[0],c[1],c[2]),new D(l[0],l[1],l[2])),a.normalized){let h=Hh(Sr[a.componentType]);i.min.multiplyScalar(h),i.max.multiplyScalar(h)}}else{console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.");return}}else return;let r=e.targets;if(r!==void 0){let a=new D,c=new D;for(let l=0,h=r.length;l<h;l++){let u=r[l];if(u.POSITION!==void 0){let d=t.json.accessors[u.POSITION],p=d.min,g=d.max;if(p!==void 0&&g!==void 0){if(c.setX(Math.max(Math.abs(p[0]),Math.abs(g[0]))),c.setY(Math.max(Math.abs(p[1]),Math.abs(g[1]))),c.setZ(Math.max(Math.abs(p[2]),Math.abs(g[2]))),d.normalized){let _=Hh(Sr[d.componentType]);c.multiplyScalar(_)}a.max(c)}else console.warn("THREE.GLTFLoader: Missing min/max properties for accessor POSITION.")}}i.expandByVector(a)}s.boundingBox=i;let o=new An;i.getCenter(o.center),o.radius=i.min.distanceTo(i.max)/2,s.boundingSphere=o}function Mf(s,e,t){let n=e.attributes,i=[];function r(o,a){return t.getDependency("accessor",o).then(function(c){s.setAttribute(a,c)})}for(let o in n){let a=zh[o]||o.toLowerCase();a in s.attributes||i.push(r(n[o],a))}if(e.indices!==void 0&&!s.index){let o=t.getDependency("accessor",e.indices).then(function(a){s.setIndex(a)});i.push(o)}return ft.workingColorSpace!==Jt&&"COLOR_0"in n&&console.warn(`THREE.GLTFLoader: Converting vertex colors from "srgb-linear" to "${ft.workingColorSpace}" not supported.`),Bi(s,e),ly(s,e,t),Promise.all(i).then(function(){return e.targets!==void 0?sy(s,e.targets,t):s})}var Ac=class extends mo{constructor(e){super(e),this.type=Qn}parse(e){let o=function(R,M){switch(R){case 1:throw new Error("THREE.RGBELoader: Read Error: "+(M||""));case 2:throw new Error("THREE.RGBELoader: Write Error: "+(M||""));case 3:throw new Error("THREE.RGBELoader: Bad File Format: "+(M||""));default:case 4:throw new Error("THREE.RGBELoader: Memory Error: "+(M||""))}},u=function(R,M,y){M=M||1024;let F=R.pos,U=-1,O=0,$="",k=String.fromCharCode.apply(null,new Uint16Array(R.subarray(F,F+128)));for(;0>(U=k.indexOf(`
`))&&O<M&&F<R.byteLength;)$+=k,O+=k.length,F+=128,k+=String.fromCharCode.apply(null,new Uint16Array(R.subarray(F,F+128)));return-1<U?(y!==!1&&(R.pos+=O+U+1),$+k.slice(0,U)):!1},d=function(R){let M=/^#\?(\S+)/,y=/^\s*GAMMA\s*=\s*(\d+(\.\d+)?)\s*$/,I=/^\s*EXPOSURE\s*=\s*(\d+(\.\d+)?)\s*$/,F=/^\s*FORMAT=(\S+)\s*$/,U=/^\s*\-Y\s+(\d+)\s+\+X\s+(\d+)\s*$/,O={valid:0,string:"",comments:"",programtype:"RGBE",format:"",gamma:1,exposure:1,width:0,height:0},$,k;for((R.pos>=R.byteLength||!($=u(R)))&&o(1,"no header found"),(k=$.match(M))||o(3,"bad initial token"),O.valid|=1,O.programtype=k[1],O.string+=$+`
`;$=u(R),$!==!1;){if(O.string+=$+`
`,$.charAt(0)==="#"){O.comments+=$+`
`;continue}if((k=$.match(y))&&(O.gamma=parseFloat(k[1])),(k=$.match(I))&&(O.exposure=parseFloat(k[1])),(k=$.match(F))&&(O.valid|=2,O.format=k[1]),(k=$.match(U))&&(O.valid|=4,O.height=parseInt(k[1],10),O.width=parseInt(k[2],10)),O.valid&2&&O.valid&4)break}return O.valid&2||o(3,"missing format specifier"),O.valid&4||o(3,"missing image size specifier"),O},p=function(R,M,y){let I=M;if(I<8||I>32767||R[0]!==2||R[1]!==2||R[2]&128)return new Uint8Array(R);I!==(R[2]<<8|R[3])&&o(3,"wrong scanline width");let F=new Uint8Array(4*M*y);F.length||o(4,"unable to allocate buffer space");let U=0,O=0,$=4*I,k=new Uint8Array(4),ee=new Uint8Array($),Y=y;for(;Y>0&&O<R.byteLength;){O+4>R.byteLength&&o(1),k[0]=R[O++],k[1]=R[O++],k[2]=R[O++],k[3]=R[O++],(k[0]!=2||k[1]!=2||(k[2]<<8|k[3])!=I)&&o(3,"bad rgbe scanline format");let ce=0,pe;for(;ce<$&&O<R.byteLength;){pe=R[O++];let Ue=pe>128;if(Ue&&(pe-=128),(pe===0||ce+pe>$)&&o(3,"bad scanline data"),Ue){let Ge=R[O++];for(let te=0;te<pe;te++)ee[ce++]=Ge}else ee.set(R.subarray(O,O+pe),ce),ce+=pe,O+=pe}let Ie=I;for(let Ue=0;Ue<Ie;Ue++){let Ge=0;F[U]=ee[Ue+Ge],Ge+=I,F[U+1]=ee[Ue+Ge],Ge+=I,F[U+2]=ee[Ue+Ge],Ge+=I,F[U+3]=ee[Ue+Ge],U+=4}Y--}return F},g=function(R,M,y,I){let F=R[M+3],U=Math.pow(2,F-128)/255;y[I+0]=R[M+0]*U,y[I+1]=R[M+1]*U,y[I+2]=R[M+2]*U,y[I+3]=1},_=function(R,M,y,I){let F=R[M+3],U=Math.pow(2,F-128)/255;y[I+0]=Zi.toHalfFloat(Math.min(R[M+0]*U,65504)),y[I+1]=Zi.toHalfFloat(Math.min(R[M+1]*U,65504)),y[I+2]=Zi.toHalfFloat(Math.min(R[M+2]*U,65504)),y[I+3]=Zi.toHalfFloat(1)},m=new Uint8Array(e);m.pos=0;let f=d(m),v=f.width,S=f.height,x=p(m.subarray(m.pos),v,S),P,T,w;switch(this.type){case gn:w=x.length/4;let R=new Float32Array(w*4);for(let y=0;y<w;y++)g(x,y*4,R,y*4);P=R,T=gn;break;case Qn:w=x.length/4;let M=new Uint16Array(w*4);for(let y=0;y<w;y++)_(x,y*4,M,y*4);P=M,T=Qn;break;default:throw new Error("THREE.RGBELoader: Unsupported type: "+this.type)}return{width:v,height:S,data:P,header:f.string,gamma:f.gamma,exposure:f.exposure,type:T}}setDataType(e){return this.type=e,this}load(e,t,n,i){function r(o,a){switch(o.type){case gn:case Qn:o.colorSpace=Jt,o.minFilter=Nt,o.magFilter=Nt,o.generateMipmaps=!1,o.flipY=!0;break}t&&t(o,a)}return super.load(e,r,n,i)}};var wc=class extends ys{constructor(){super();let e=new pn;e.deleteAttribute("uv");let t=new Rt({side:Vt}),n=new Rt,i=new Rs(16777215,900,28,2);i.position.set(.418,16.199,.3),this.add(i);let r=new we(e,t);r.position.set(-.757,13.219,.717),r.scale.set(31.713,28.305,28.591),this.add(r);let o=new we(e,n);o.position.set(-10.906,2.009,1.846),o.rotation.set(0,-.195,0),o.scale.set(2.328,7.905,4.651),this.add(o);let a=new we(e,n);a.position.set(-5.607,-.754,-.758),a.rotation.set(0,.994,0),a.scale.set(1.97,1.534,3.955),this.add(a);let c=new we(e,n);c.position.set(6.167,.857,7.803),c.rotation.set(0,.561,0),c.scale.set(3.927,6.285,3.687),this.add(c);let l=new we(e,n);l.position.set(-2.017,.018,6.124),l.rotation.set(0,.333,0),l.scale.set(2.002,4.566,2.064),this.add(l);let h=new we(e,n);h.position.set(2.291,-.756,-2.621),h.rotation.set(0,-.286,0),h.scale.set(1.546,1.552,1.496),this.add(h);let u=new we(e,n);u.position.set(-2.193,-.369,-5.547),u.rotation.set(0,.516,0),u.scale.set(3.875,3.487,2.986),this.add(u);let d=new we(e,Er(50));d.position.set(-16.116,14.37,8.208),d.scale.set(.1,2.428,2.739),this.add(d);let p=new we(e,Er(50));p.position.set(-16.109,18.021,-8.207),p.scale.set(.1,2.425,2.751),this.add(p);let g=new we(e,Er(17));g.position.set(14.904,12.198,-1.832),g.scale.set(.15,4.265,6.331),this.add(g);let _=new we(e,Er(43));_.position.set(-.462,8.89,14.52),_.scale.set(4.38,5.441,.088),this.add(_);let m=new we(e,Er(20));m.position.set(3.235,11.486,-12.541),m.scale.set(2.5,2,.1),this.add(m);let f=new we(e,Er(100));f.position.set(0,20,0),f.scale.set(1,.1,1),this.add(f)}dispose(){let e=new Set;this.traverse(t=>{t.isMesh&&(e.add(t.geometry),e.add(t.material))});for(let t of e)t.dispose()}};function Er(s){let e=new wt;return e.color.setScalar(s),e}var Gh=11.2,Sf=44,Ef=144,is=-2.45,ss=4.25,Pc=-2.06,Dn=1.95,ei=1.02,hy=.31,If=3.85,Pf=-.35,uy=.16,Vh=.78,Tf=1.25,Wh=.85,Af=.92,Lf=.34,Co=-3.65,Io=-2.15,Lc=.52,Cc=1.32,Ic=.92,dy=.056,wf=[{x:2.55,z:-.95},{x:-4.25,z:1.55},{x:-1.15,z:6.15},{x:3.45,z:3.65},{x:-2.25,z:-4.15}];function vt(s,e,t){return Math.max(e,Math.min(t,s))}function Ft(s,e,t){let n=vt((t-s)/(e-s),0,1);return n*n*(3-2*n)}function wr(s){let e=s>>>0;return()=>(e=e*1664525+1013904223>>>0,e/4294967296)}function Ro(s,e,t,n){let i=(s%t+t)%t,r=(e%t+t)%t,o=i*374761393+r*668265263+n*1442695041|0;return o=(o^o>>>13)*1274126177|0,((o^o>>>16)>>>0)/4294967296}function fy(s,e,t,n){let i=s*t,r=e*t,o=Math.floor(i),a=Math.floor(r),c=i-o,l=r-a,h=c*c*(3-2*c),u=l*l*(3-2*l),d=Ro(o,a,t,n),p=Ro(o+1,a,t,n),g=Ro(o,a+1,t,n),_=Ro(o+1,a+1,t,n),m=d+(p-d)*h,f=g+(_-g)*h;return m+(f-m)*u}function Oi(s,e,t,n,i){let r=0,o=.5,a=0,c=t;for(let l=0;l<n;l+=1)r+=fy(s,e,c,i+l*31)*o,a+=o,o*=.5,c*=2;return r/a}function Dc(s,e,t,n,i){let r=s-t,o=e-n,a=Math.cos(i),c=Math.sin(i);return{lx:r*a-o*c,lz:r*c+o*a}}function Df(s,e,t,n,i){let r=Math.cos(i),o=Math.sin(i);return{wx:t+s*r+e*o,wz:n-s*o+e*r}}function Rr(s,e){return Dc(s,e,is,ss,Pc)}function Rf(s,e){return Df(s,e,is,ss,Pc)}function Ar(s,e){let{lx:t,lz:n}=Rr(s,e),i=.68*Math.sin(n*.3)+.22*Math.sin(n*.68+.9);return{dist:t-i,along:n}}function mi(s,e){let t=Math.abs(s),n=Math.abs(e);if(t>Dn+.08||n>ei+.05)return null;let i=vt(t/Dn,0,1),r=Math.cos(i*Math.PI*.5);return hy*r*r+.016}function Uf(s,e){let{lx:t,lz:n}=Dc(s,e,If,Pf,uy),i=Math.abs(t),r=Math.abs(n);if(i>=Vh+Tf||r>=Wh+Af)return 0;let o=i<=Vh?1:vt(1-(i-Vh)/Tf,0,1),a=r<=Wh?1:vt(1-(r-Wh)/Af,0,1),c=o*o*(3-2*o),l=a*a*(3-2*a);return Lf*c*l}function py(s,e){let{lx:t,lz:n}=Dc(s,e,Co,Io,Lc);if(Math.abs(t)>Cc||Math.abs(n)>Ic)return 0;let i=.5*(1+Math.cos(t/Cc*Math.PI*6)),r=Math.max(0,Math.cos(t/Cc*(Math.PI*.5))),o=Ft(Ic,Ic-.16,Math.abs(n));return dy*i*r*o}function Ln(s,e){let t=Math.hypot(s,e),n=Ft(2.1,4.6,t),i=.26*Math.sin(s*.24+.7)*Math.cos(e*.22-.4),r=.16*Math.sin(s*.39-e*.32+1.4),o=.032*Math.sin(s*1.1+e*.85)*Math.cos(s*.6-e*1),a=Ft(8.4,19.5,t)*1.85,c=(i+r+o)*n+a,l=Ar(s,e),h=Ft(2.35,3.6,t),u=Math.exp(-(l.dist*l.dist)/(2*.78*.78)),d=Math.exp(-(l.dist*l.dist)/(2*1.75*1.75));c=c*(1-.68*d*h)-.25*u*h;let{lx:p,lz:g}=Rr(s,e),_=Math.abs(p),m=Math.abs(g);if(_>=Dn-.35&&_<=Dn+1.45&&m<=ei+.85){let f=Math.abs(_-Dn),v=Ft(1.35,0,f),S=Ft(ei+.85,ei-.05,m),x=v*S;c=c*(1-x)+.014*x}return c+=Uf(s,e),c+=py(s,e),c}function Rc(s,e){let t=Ln(s,e),{lx:n,lz:i}=Rr(s,e),r=mi(n,i);return r!==null?Math.max(t,r):t}function Tr(s,e){let t=Math.exp(-((e+.16*Math.sin(s*.65))**2)/1.0368)*Ft(-.4,1.3,s)*Ft(7.2,4.8,s),{lx:n,lz:i}=Rr(s,e),r=Math.exp(-(i*i)/(2*.82*.82))*Ft(-4.4,-2.5,n)*Ft(4.6,2.4,n),{lx:o,lz:a}=Dc(s,e,Co,Io,Lc),c=Math.exp(-(a*a)/(2*.75*.75))*Ft(-2.6,-1,o)*Ft(4.2,2,o);return vt(Math.max(t,r,c),0,1)}function my(){let e=document.createElement("canvas");e.width=256,e.height=256;let t=e.getContext("2d"),n=document.createElement("canvas");n.width=256,n.height=256;let i=n.getContext("2d");if(t&&i){let a=t.createImageData(256,256),c=i.createImageData(256,256),l=a.data,h=c.data;for(let d=0;d<256;d+=1){let p=d/256;for(let g=0;g<256;g+=1){let _=g/256,m=Oi(_,p,4,4,17),f=Oi(_,p,16,3,93),v=Ro(g,d,256,311),S=.72+(m-.5)*.34+(f-.5)*.22+(v-.5)*.08,x=vt(Math.round(S*228),0,255),P=vt(Math.round(S*234),0,255),T=vt(Math.round(S*218),0,255),w=(d*256+g)*4;l[w]=x,l[w+1]=P,l[w+2]=T,l[w+3]=255;let R=vt(Math.round((m*.45+f*.4+v*.15)*255),0,255);h[w]=R,h[w+1]=R,h[w+2]=R,h[w+3]=255}}t.putImageData(a,0,0),i.putImageData(c,0,0);let u=wr(5142);for(let d=0;d<950;d+=1){let p=u()*256,g=u()*256,_=3+u()*7,m=u()*Math.PI*2;t.strokeStyle=u()>.45?"rgba(38, 30, 20, 0.24)":"rgba(176, 186, 148, 0.16)",t.lineWidth=.75+u()*.65,t.beginPath(),t.moveTo(p,g),t.lineTo(p+Math.cos(m)*_,g+Math.sin(m)*_),t.stroke()}}let r=new Lt(e);r.colorSpace=ct,r.wrapS=bt,r.wrapT=bt,r.repeat.set(18,18),r.anisotropy=4,r.needsUpdate=!0;let o=new Lt(n);return o.wrapS=bt,o.wrapT=bt,o.repeat.set(18,18),o.needsUpdate=!0,{map:r,bumpMap:o}}function gy(){let e=document.createElement("canvas");e.width=256,e.height=256;let t=e.getContext("2d"),n=document.createElement("canvas");n.width=256,n.height=256;let i=n.getContext("2d");if(t&&i){let a=t.createImageData(256,256),c=i.createImageData(256,256);for(let h=0;h<256;h+=1){let u=h/256;for(let d=0;d<256;d+=1){let p=d/256,g=Oi(p*4,u*.75,8,3,701),_=Oi(p*12,u*1.6,8,3,433),m=Ft(.28,.62,g*.55+_*.45),f=Ft(.72,.88,Oi(p*2,u*1.5,6,3,919)),v=24+m*38,S=18+m*27,x=15+m*20;v=v*(1-f*.35)+64*(f*.35),S=S*(1-f*.35)+82*(f*.35),x=x*(1-f*.35)+56*(f*.35);let P=(h*256+d)*4;a.data[P]=vt(Math.round(v),0,255),a.data[P+1]=vt(Math.round(S),0,255),a.data[P+2]=vt(Math.round(x),0,255),a.data[P+3]=255;let T=vt(Math.round(m*245),0,255);c.data[P]=T,c.data[P+1]=T,c.data[P+2]=T,c.data[P+3]=255}}t.putImageData(a,0,0),i.putImageData(c,0,0);let l=wr(7741);for(let h=0;h<120;h+=1){let u=l()*256;t.strokeStyle="rgba(12, 9, 7, 0.42)",t.lineWidth=1+l()*1.8,t.beginPath(),t.moveTo(u,0),t.lineTo(u+(l()-.5)*6,256),t.stroke()}}let r=new Lt(e);r.colorSpace=ct,r.wrapS=bt,r.wrapT=bt,r.repeat.set(1,3),r.needsUpdate=!0;let o=new Lt(n);return o.wrapS=bt,o.wrapT=bt,o.repeat.set(1,3),o.needsUpdate=!0,{map:r,bumpMap:o}}function _y(){let t=document.createElement("canvas");t.width=512,t.height=256;let n=t.getContext("2d");if(n){n.clearRect(0,0,512,256);let r=wr(4419),o=n.createLinearGradient(0,0,0,256*.78);o.addColorStop(0,"#132419"),o.addColorStop(.55,"#1d3823"),o.addColorStop(1,"rgba(29, 56, 35, 0)"),n.fillStyle=o,n.fillRect(0,0,512,256*.62);let a=14;for(let c=0;c<a;c+=1){let l=(c+.5)/a*512+(r()-.5)*12,h=256*(.64+r()*.3),u=512/a*(.78+r()*.35);n.strokeStyle="#2c2218",n.lineWidth=2.6,n.beginPath(),n.moveTo(l,0),n.lineTo(l+(r()-.5)*14,h*.85),n.stroke();let d=24;for(let p=0;p<d;p+=1){let g=p/(d-1),_=g*h,m=u*(1-g*.72)*(.55+.45*Math.sin(g*Math.PI)),f=9;for(let v=0;v<f;v+=1){let S=v%2===0?1:-1,x=Math.PI*.5+S*(.28+r()*.95),P=(10+r()*19)*(1-g*.42),T=l+(r()-.5)*m*.55,w=_+(r()-.5)*8,R=T+Math.cos(x)*P,M=w+Math.sin(x)*P,y=g*.5+r()*.45,I=Math.round(24+y*42),F=Math.round(48+y*68),U=Math.round(30+y*30);n.strokeStyle=`rgb(${I},${F},${U})`,n.lineWidth=2+r()*1.4,n.lineCap="round";for(let O of[0,-512,512])n.beginPath(),n.moveTo(T+O,w),n.lineTo(R+O,M),n.stroke()}}}}let i=new Lt(t);return i.colorSpace=ct,i.wrapS=bt,i.wrapT=Mn,i.anisotropy=4,i.needsUpdate=!0,i}function xy(){let t=document.createElement("canvas");t.width=128,t.height=256;let n=t.getContext("2d");if(n){n.clearRect(0,0,128,256);let r=128/2,o=n.createLinearGradient(r,256,r,8);o.addColorStop(0,"#1e351c"),o.addColorStop(.6,"#39612d"),o.addColorStop(1,"#658f44"),n.strokeStyle=o,n.lineWidth=3.2,n.beginPath(),n.moveTo(r,254),n.lineTo(r,12),n.stroke();let a=19;for(let c=0;c<a;c+=1){let l=c/(a-1),h=238-l*224,u=Math.sin(Math.pow(l,.72)*Math.PI)*(1-.12*l),d=8+u*46,p=3.6+u*3.8,g=.25+l*.75,_=Math.round(30+g*58),m=Math.round(58+g*82),f=Math.round(26+g*28);n.fillStyle=`rgb(${_},${m},${f})`;for(let v of[-1,1])n.save(),n.translate(r,h),n.rotate(v*(-.34+l*.14)),n.beginPath(),n.moveTo(0,0),n.quadraticCurveTo(v*d*.5,-p,v*d,-2),n.quadraticCurveTo(v*d*.5,p*.75,0,2),n.closePath(),n.fill(),n.restore()}}let i=new Lt(t);return i.colorSpace=ct,i.anisotropy=4,i.needsUpdate=!0,i}function yy(){let e=document.createElement("canvas");e.width=256,e.height=256;let t=e.getContext("2d");if(t){let i=t.createImageData(256,256);for(let r=0;r<256;r+=1)for(let o=0;o<256;o+=1){let a=Oi(o/256,r/256,6,4,613),c=Oi(o/256,r/256,16,3,829),l=Ft(.36,.52,Math.abs(a-.5)*2+c*.35),h=vt(Math.round((.55+l*.45)*235),0,255),u=(r*256+o)*4;i.data[u]=h,i.data[u+1]=h,i.data[u+2]=vt(h+6,0,255),i.data[u+3]=255}t.putImageData(i,0,0)}let n=new Lt(e);return n.colorSpace=ct,n.wrapS=bt,n.wrapT=bt,n.repeat.set(2,2),n.needsUpdate=!0,n}function vy(){let e=document.createElement("canvas");e.width=256,e.height=256;let t=e.getContext("2d");if(t){let i=t.createImageData(256,256);for(let r=0;r<256;r+=1)for(let o=0;o<256;o+=1){let a=Oi(o/256*.5,r/256*3.5,8,4,523),c=vt(Math.round(78+a*56),0,255),l=vt(Math.round(58+a*44),0,255),h=vt(Math.round(42+a*30),0,255),u=(r*256+o)*4;i.data[u]=c,i.data[u+1]=l,i.data[u+2]=h,i.data[u+3]=255}t.putImageData(i,0,0),t.fillStyle="rgba(46, 72, 38, 0.24)",t.fillRect(0,0,256,14),t.fillRect(0,242,256,14)}let n=new Lt(e);return n.colorSpace=ct,n.wrapS=bt,n.wrapT=bt,n.needsUpdate=!0,n}function My(){let e=document.createElement("canvas");e.width=256,e.height=256;let t=e.getContext("2d"),n=document.createElement("canvas");n.width=256,n.height=256;let i=n.getContext("2d");if(t&&i){let a=t.createImageData(256,256),c=i.createImageData(256,256);for(let l=0;l<256;l+=1){let h=l/256;for(let u=0;u<256;u+=1){let d=u/256,p=Ft(.02,.22,d)*Ft(.98,.78,d),g=Oi(d*1.4,h*2.8,6,4,211),_=Math.sin((h*18+g*5.2)*Math.PI)*.5+.5,m=Ft(.76,.96,g*.65+_*.35),f=(l*256+u)*4;a.data[f]=vt(Math.round(24+m*88),0,255),a.data[f+1]=vt(Math.round(56+m*102),0,255),a.data[f+2]=vt(Math.round(58+m*96),0,255),a.data[f+3]=vt(Math.round(p*(195+m*45)),0,255);let v=vt(Math.round((g*.55+_*.45)*255),0,255);c.data[f]=v,c.data[f+1]=v,c.data[f+2]=v,c.data[f+3]=255}}t.putImageData(a,0,0),i.putImageData(c,0,0)}let r=new Lt(e);r.colorSpace=ct,r.wrapS=Mn,r.wrapT=bt,r.repeat.set(1,5),r.needsUpdate=!0;let o=new Lt(n);return o.wrapS=bt,o.wrapT=bt,o.repeat.set(1,5),o.needsUpdate=!0,{map:r,bumpMap:o}}function by(){let e=document.createElement("canvas");e.width=1024,e.height=1024;let t=e.getContext("2d");if(t){t.clearRect(0,0,1024,1024);let o=t.createRadialGradient(512,512,1024*.05,512,512,1024*.46);o.addColorStop(0,"rgba(28, 34, 32, 0.72)"),o.addColorStop(.7,"rgba(24, 30, 28, 0.56)"),o.addColorStop(.9,"rgba(26, 36, 28, 0.22)"),o.addColorStop(1,"rgba(0, 0, 0, 0)"),t.fillStyle=o,t.beginPath(),t.arc(512,512,1024*.46,0,Math.PI*2),t.fill(),t.save(),t.shadowColor="rgba(235, 220, 178, 0.45)",t.shadowBlur=10,t.strokeStyle="rgba(232, 240, 228, 0.58)",t.lineWidth=2.6,t.beginPath(),t.arc(512,512,1024*.365,0,Math.PI*2),t.stroke(),t.restore(),t.strokeStyle="rgba(232, 200, 138, 0.34)",t.lineWidth=1.6,t.setLineDash([12,12]),t.beginPath(),t.arc(512,512,1024*.425,0,Math.PI*2),t.stroke(),t.setLineDash([]),t.save(),t.translate(512-1024*.14,512-1024*.25),t.rotate(-2.25),t.fillStyle="rgba(226, 236, 226, 0.62)",t.font='700 38px "Segoe UI", "Helvetica Neue", Arial, sans-serif',t.textAlign="center",t.textBaseline="middle";let a=["D","O","S","O"],c=40,l=-((a.length-1)*c)/2;a.forEach((h,u)=>{t.fillText(h,l+u*c,0)}),t.restore()}let n=new Lt(e);return n.colorSpace=ct,n.anisotropy=4,n.needsUpdate=!0,n}function Sy(){let s=document.createElement("canvas");s.width=128,s.height=256;let e=s.getContext("2d");if(e){e.clearRect(0,0,128,256);let n=e.createLinearGradient(0,0,128,0);n.addColorStop(0,"rgba(255, 224, 166, 0)"),n.addColorStop(.26,"rgba(255, 228, 174, 0.18)"),n.addColorStop(.5,"rgba(255, 238, 194, 0.34)"),n.addColorStop(.74,"rgba(255, 228, 174, 0.18)"),n.addColorStop(1,"rgba(255, 224, 166, 0)"),e.fillStyle=n,e.fillRect(0,0,128,256),e.globalCompositeOperation="destination-in";let i=e.createLinearGradient(0,0,0,256);i.addColorStop(0,"rgba(255, 255, 255, 0)"),i.addColorStop(.16,"rgba(255, 255, 255, 0.95)"),i.addColorStop(.72,"rgba(255, 255, 255, 0.55)"),i.addColorStop(1,"rgba(255, 255, 255, 0)"),e.fillStyle=i,e.fillRect(0,0,128,256)}let t=new Lt(s);return t.colorSpace=ct,t.needsUpdate=!0,t}function Ey(){let e=document.createElement("canvas");e.width=256,e.height=256;let t=e.getContext("2d");if(t){t.clearRect(0,0,256,256);let i=256/2,r=t.createRadialGradient(i,i,6,i,i,i*.92);r.addColorStop(0,"rgba(215, 232, 222, 0.24)"),r.addColorStop(.42,"rgba(182, 210, 202, 0.12)"),r.addColorStop(.78,"rgba(150, 184, 178, 0.03)"),r.addColorStop(1,"rgba(140, 176, 170, 0)"),t.fillStyle=r,t.fillRect(0,0,256,256)}let n=new Lt(e);return n.colorSpace=ct,n.needsUpdate=!0,n}function Ty(){let e=document.createElement("canvas");e.width=64,e.height=64;let t=e.getContext("2d");if(t){let r=t.createRadialGradient(32,32,1,32,32,32);r.addColorStop(0,"rgba(255, 250, 224, 1)"),r.addColorStop(.26,"rgba(255, 220, 146, 0.72)"),r.addColorStop(.62,"rgba(218, 232, 170, 0.20)"),r.addColorStop(1,"rgba(180, 220, 160, 0)"),t.fillStyle=r,t.fillRect(0,0,64,64)}let n=new Lt(e);return n.colorSpace=ct,n.needsUpdate=!0,n}function Nf(){let s=document.createElement("canvas");s.width=512,s.height=256;let e=s.getContext("2d");if(e){let n=e.createLinearGradient(0,0,0,256);n.addColorStop(0,"#0a161c"),n.addColorStop(.22,"#142931"),n.addColorStop(.38,"#264344"),n.addColorStop(.47,"#4d6a5e"),n.addColorStop(.54,"#8d8c6d"),n.addColorStop(.6,"#3a4f45"),n.addColorStop(.72,"#182824"),n.addColorStop(1,"#0b1412"),e.fillStyle=n,e.fillRect(0,0,512,256);let i=e.createRadialGradient(256,122,10,256,122,168);i.addColorStop(0,"rgba(255, 240, 194, 0.96)"),i.addColorStop(.2,"rgba(255, 210, 142, 0.64)"),i.addColorStop(.5,"rgba(208, 176, 124, 0.26)"),i.addColorStop(1,"rgba(110, 128, 108, 0)"),e.fillStyle=i,e.fillRect(0,0,512,256)}let t=new Lt(s);return t.colorSpace=ct,t.needsUpdate=!0,t}function Ff(s){let e=0,t=0;for(let u of s)e+=u.attributes.position.count,t+=u.index?u.index.count:u.attributes.position.count;let n=new Float32Array(e*3),i=new Float32Array(e*3),r=new Float32Array(e*2),o=new Float32Array(e*3),a=new Uint32Array(t),c=0,l=0;for(let u of s){let d=u.attributes.position,p=u.attributes.normal,g=u.attributes.uv,_=u.attributes.color,m=d.count;for(let f=0;f<m;f+=1){let v=(c+f)*3,S=(c+f)*2;n[v]=d.getX(f),n[v+1]=d.getY(f),n[v+2]=d.getZ(f),p&&(i[v]=p.getX(f),i[v+1]=p.getY(f),i[v+2]=p.getZ(f)),g&&(r[S]=g.getX(f),r[S+1]=g.getY(f)),_?(o[v]=_.getX(f),o[v+1]=_.getY(f),o[v+2]=_.getZ(f)):(o[v]=1,o[v+1]=1,o[v+2]=1)}if(u.index){let f=u.index;for(let v=0;v<f.count;v+=1)a[l+v]=f.getX(v)+c;l+=f.count}else{for(let f=0;f<m;f+=1)a[l+f]=c+f;l+=m}c+=m,u.dispose()}let h=new Bt;return h.setAttribute("position",new xt(n,3)),h.setAttribute("normal",new xt(i,3)),h.setAttribute("uv",new xt(r,2)),h.setAttribute("color",new xt(o,3)),h.setIndex(new xt(a,1)),h}function Cf(s,e){let t=wr(s),n=[],i=1.55,r=5.4,o=new ge(6057568),a=new ge(10006678),c=new ge(14411976),l=new ge;for(let h=0;h<e;h+=1){let u=h/Math.max(1,e-1),d=i+u*(r*.8),p=(1.55-u*.62)*(.94+t()*.14),g=(1.42*(1-u*.72)+.18)*(.92+t()*.16),_=h===e-1?.03:g*.22,m=new mn(_,g,p,14,3,!0);m.translate(0,d+p*.44,0),m.rotateY(t()*Math.PI*2);let f=m.attributes.position,v=m.attributes.uv,S=new Float32Array(f.count*3),x=6+h%3;for(let P=0;P<f.count;P+=1){let T=f.getX(P),w=f.getY(P),R=f.getZ(P),M=Math.hypot(T,R),y=Math.atan2(R,T),I=v.getX(P)*(h<e-2?1.5:1),F=v.getY(P);if(v.setXY(P,I,F),M>.08){let $=1-F,ee=1+(.86+.2*Math.sin(y*x+h*1.9)-1)*$;T*=ee,R*=ee,w-=$*M*.22-$*$*M*.08}f.setXYZ(P,T,w,R);let U=vt((w-i)/r,0,1),O=vt(1-F*.35,0,1);l.copy(o).lerp(a,vt(U*.75+O*.28,0,1)),U>.42&&l.lerp(c,(U-.42)*.65),S[P*3]=l.r,S[P*3+1]=l.g,S[P*3+2]=l.b}m.setAttribute("color",new xt(S,3)),m.computeVertexNormals(),n.push(m)}return Ff(n)}function Ay(){let s=new mn(.055,.23,6.2,12,8);s.translate(0,3.05,0);let e=s.attributes.position;for(let t=0;t<e.count;t+=1){let n=e.getX(t),i=e.getY(t),r=e.getZ(t),o=i<.7?1+Math.pow(1-i/.7,2)*.48:1,a=Math.sin(i*.36)*.055;e.setXYZ(t,n*o+a,i,r*o)}return s.computeVertexNormals(),s}function wy(s){let e=new co(.54,3),t=e.attributes.position,n=new Float32Array(t.count*3),i=new ge(2633264),r=new ge(4672845),o=new ge(2966565),a=new ge;for(let c=0;c<t.count;c+=1){let l=t.getX(c),h=t.getY(c),u=t.getZ(c),d=Math.sin(l*3.8+s)*Math.cos(u*3.4-s*.6),p=Math.cos(h*4.8+l*2.9+s*1.4),g=Math.sin((l+u)*7.2+h*5.5)*.04,_=.86+.14*d+.08*p+g;l*=_*1.18,h*=_*.68,u*=_*1.04,h<-.15&&(h=-.15+(h+.15)*.3),t.setXYZ(c,l,h,u);let m=vt((h+.16)/.44,0,1),f=vt(.5+d*.5,0,1);a.copy(i).lerp(r,m*.55+f*.25),m>.58&&a.lerp(o,Ft(.58,.9,m)*.72),n[c*3]=a.r,n[c*3+1]=a.g,n[c*3+2]=a.b}return e.setAttribute("color",new xt(n,3)),e.computeVertexNormals(),e}function Ry(){let s=[],t=new ge(7177314),n=new ge(13492906),i=new ge;for(let r=0;r<7;r+=1){let o=r/7*Math.PI*2+r%2*.22,a=.35+r%3*.08,c=new jt(.28,.62,1,5);c.translate(0,.31,0);let l=c.attributes.position,h=new Float32Array(l.count*3);for(let u=0;u<l.count;u+=1){let d=l.getX(u),p=l.getY(u),g=vt(p/.62,0,1),_=g*a+g*g*.28,m=p*(1-.38*g*g);l.setXYZ(u,d,m,_),i.copy(t).lerp(n,g),h[u*3]=i.r,h[u*3+1]=i.g,h[u*3+2]=i.b}c.setAttribute("color",new xt(h,3)),c.rotateY(o),c.computeVertexNormals(),s.push(c)}return Ff(s)}function Bf(){let s=new Pt,e=[],t=[],n=my(),i=gy(),r=_y(),o=xy(),a=yy(),c=vy(),l=My(),h=by(),u=Sy(),d=Ey(),p=Ty();t.push(n.map,n.bumpMap,i.map,i.bumpMap,r,o,a,c,l.map,l.bumpMap,h,u,d,p);let g=new jt(Sf,Sf,Ef,Ef);g.rotateX(-Math.PI/2);let _=g.attributes.position,m=new Float32Array(_.count*3),f=new ge(2572068),v=new ge(1779995),S=new ge(5390897),x=new ge(1779751),P=new ge(4146757),T=new ge;for(let C=0;C<_.count;C+=1){let G=_.getX(C),V=_.getZ(C),J=Ln(G,V);_.setY(C,J);let Q=Math.hypot(G,V),ae=Tr(G,V),q=Ar(G,V),Te=Math.exp(-(q.dist*q.dist)/(2*1.05*1.05))*Ft(2.2,3.4,Q),Re=vt(Uf(G,V)/Lf,0,1),Ve=.5+.5*Math.sin(G*.55+V*.48)*Math.cos(G*.32-V*.68);T.copy(v).lerp(f,Ve*(1-Ft(8,15,Q)*.55)),T.lerp(S,ae*.76),T.lerp(P,Ft(.28,.92,Re)*.74),T.lerp(x,Te*.88),m[C*3]=T.r,m[C*3+1]=T.g,m[C*3+2]=T.b}g.setAttribute("color",new xt(m,3)),g.computeVertexNormals();let w=new Rt({map:n.map,bumpMap:n.bumpMap,bumpScale:.045,vertexColors:!0,roughness:.94,metalness:.02,envMapIntensity:.16}),R=new we(g,w);R.receiveShadow=!0,s.add(R),t.push(g,w);let M=new jt(1.92,1.92),y=new wt({map:h,transparent:!0,depthWrite:!1,opacity:.44}),I=new we(M,y);I.rotation.x=-Math.PI/2,I.position.y=Rc(0,0)+.008,s.add(I),t.push(M,y);let F=26,U=new jt(2.15,F,10,72);U.rotateX(-Math.PI/2);let O=U.attributes.position;for(let C=0;C<O.count;C+=1){let G=O.getX(C),V=O.getZ(C),J=.68*Math.sin(V*.3)+.22*Math.sin(V*.68+.9);O.setX(C,G+J)}U.computeVertexNormals();let $=new Rt({map:l.map,bumpMap:l.bumpMap,bumpScale:.035,color:3894892,emissive:794914,emissiveIntensity:.28,roughness:.12,metalness:.68,transparent:!0,opacity:.88,depthWrite:!1,envMapIntensity:1.25}),k=new we(U,$);k.position.set(is,-.095,ss),k.rotation.y=Pc,k.receiveShadow=!0,s.add(k),t.push(U,$);let ee=new Pt;ee.position.set(is,0,ss),ee.rotation.y=Pc;let Y=new Rt({map:c,color:10915444,roughness:.88,metalness:.03,envMapIntensity:.18}),ce=new Rt({map:i.map,bumpMap:i.bumpMap,bumpScale:.02,color:6442299,roughness:.92,metalness:.03,envMapIntensity:.14}),pe=new wt({color:16766351}),Ie=new Ji({map:p,color:16762478,transparent:!0,opacity:.52,blending:jn,depthWrite:!1});t.push(Y,ce,pe,Ie);let Ue=22,Ge=new pn(.165,.048,ei*2);t.push(Ge);for(let C=0;C<Ue;C+=1){let G=C/(Ue-1),V=-Dn+.09+G*(Dn*2-.18),J=mi(V,0)??0,Q=mi(V+.08,0)??J,ae=mi(V-.08,0)??J,q=Math.atan2(Q-ae,.16),Te=new we(Ge,Y);Te.position.set(V,J-.024,0),Te.rotation.z=q,Te.castShadow=!0,Te.receiveShadow=!0,ee.add(Te)}let te=new pn(.68,.095,.095),ue=new mn(.022,.022,1.85,6);ue.rotateZ(Math.PI/2);let Ae=new mn(.056,.072,.72,10),ye=new oo(.092,.075,6),Be=new mn(.044,.044,.095,8);t.push(te,ue,Ae,ye,Be);for(let C of[-ei+.04,ei-.04]){for(let G=-2;G<=2;G+=1){let V=G*.66,J=(mi(V,0)??0)+.015,Q=mi(V+.1,0)??J,ae=mi(V-.1,0)??J,q=new we(te,ce);q.position.set(V,J,C),q.rotation.z=Math.atan2(Q-ae,.2),q.castShadow=!0,ee.add(q)}for(let G of[-Dn+.14,0,Dn-.14]){let V=mi(G,0)??0,J=new we(Ae,ce);if(J.position.set(G,V+.28,C),J.castShadow=!0,ee.add(J),G!==0){let Q=new we(Be,pe);Q.position.set(G,V+.66,C),ee.add(Q);let ae=new we(ye,ce);ae.position.set(G,V+.74,C),ee.add(ae);let q=new Ms(Ie);q.position.set(G,V+.66,C),q.scale.set(.65,.65,1),ee.add(q)}}for(let G of[-1,1]){let V=G*(Dn-.14),J=(mi(V,0)??0)+.56,Q=(mi(0,0)??0)+.56,ae=new we(ue,ce);ae.position.set(V*.5,(J+Q)*.5,C),ae.rotation.z=Math.atan2(Q-J,-V),ae.castShadow=!0,ee.add(ae)}}s.add(ee);let qe=new Pt;qe.position.set(Co,0,Io),qe.rotation.y=Lc;let Fe=new mn(.068,.074,Ic*1.95,10);Fe.rotateX(Math.PI/2),t.push(Fe);for(let C=-3;C<=3;C+=1){let G=C*(Cc/3.2),{wx:V,wz:J}=Df(G,0,Co,Io,Lc),Q=Ln(V,J),ae=new we(Fe,ce);ae.position.set(G,Q-.032,0),ae.castShadow=!0,ae.receiveShadow=!0,qe.add(ae)}s.add(qe);let Ne=wr(202611),et=[],Ke=(C,G)=>{if(Math.hypot(C,G)<3.65||Math.hypot(C-1.85,G+1.5)<2.45||Math.hypot(C-is,G-ss)<2.75||Math.hypot(C-If,G-Pf)<2.35||Math.hypot(C-Co,G-Io)<2.15||Tr(C,G)>.34)return!1;let J=Ar(C,G);if(Math.abs(J.dist)<1.25&&Math.abs(J.along)<12)return!1;for(let Q of wf)if(Math.hypot(C-Q.x,G-Q.z)<1.35)return!1;for(let Q of et)if(Math.hypot(C-Q.x,G-Q.z)<1.95)return!1;return!0},L=[[-5.4,2.2,1.28,0],[-6.8,5.4,1.44,1],[-4.1,7.2,1.36,0],[.8,6.4,1.26,1],[-7.2,-.6,1.38,1],[-5.8,-3.8,1.22,0],[2.9,5.8,1.32,0],[6.2,2.1,1.35,1],[5.8,-2.8,1.24,0],[.8,-4.8,1.18,1],[-2.5,-5.6,1.28,0],[4.4,-4.9,1.22,1]];for(let[C,G,V,J]of L)Ke(C,G)&&et.push({x:C,z:G,scale:V,yaw:Ne()*Math.PI*2,variant:J,inner:!0});let on=0;for(;et.length<96&&on<1800;){on+=1;let C=et.length>=38,G=C?10.8:4.4,V=C?19.6:11.2,J=Ne()*Math.PI*2,Q=G+Math.sqrt(Ne())*(V-G),ae=Math.cos(J)*Q,q=Math.sin(J)*Q;if((ae*-.76+q*.65)/Math.max(1,Q)>.94&&Q>8.2||!Ke(ae,q))continue;let Re=C?1.25+Ne()*.72:.96+Ne()*.48;et.push({x:ae,z:q,scale:Re,yaw:Ne()*Math.PI*2,variant:Ne()>.48?1:0,inner:!C})}let rt=Ay(),ot=Cf(101,6),ve=Cf(307,7),gt=new Rt({map:i.map,bumpMap:i.bumpMap,bumpScale:.04,roughness:.95,metalness:.02,envMapIntensity:.14}),Ce=new Rt({map:r,alphaTest:.38,vertexColors:!0,roughness:.88,metalness:.02,side:kt,envMapIntensity:.22});t.push(rt,ot,ve,gt,Ce);let A=new Fn(rt,gt,et.length);A.castShadow=!0,A.receiveShadow=!0;let b=et.filter(C=>C.variant===0),W=et.filter(C=>C.variant===1),ie=new Fn(ot,Ce,Math.max(1,b.length)),ne=new Fn(ve,Ce,Math.max(1,W.length));ie.castShadow=!0,ie.receiveShadow=!0,ne.castShadow=!0,ne.receiveShadow=!0;let Z=new St,xe=new ge,_e=0,be=0;et.forEach((C,G)=>{let V=Ln(C.x,C.z);Z.position.set(C.x,V-.14,C.z),Z.rotation.set((Ne()-.5)*.035,C.yaw,(Ne()-.5)*.035),Z.scale.set(C.scale,C.scale*(.94+Ne()*.2),C.scale),Z.updateMatrix(),A.setMatrixAt(G,Z.matrix),xe.setHSL(.32+(Ne()-.5)*.05,.18+Ne()*.14,.84+Ne()*.24),C.variant===0?(ie.setMatrixAt(_e,Z.matrix),ie.setColorAt(_e,xe),_e+=1):(ne.setMatrixAt(be,Z.matrix),ne.setColorAt(be,xe),be+=1),C.inner&&Math.hypot(C.x,C.z)<Gh+.5&&e.push({x:C.x,z:C.z,r:.24*C.scale})}),A.instanceMatrix.needsUpdate=!0,ie.instanceMatrix.needsUpdate=!0,ne.instanceMatrix.needsUpdate=!0,ie.instanceColor&&(ie.instanceColor.needsUpdate=!0),ne.instanceColor&&(ne.instanceColor.needsUpdate=!0);let We=new Pt;We.add(A,ie,ne),s.add(We);let le=new Pt;s.add(le);let Ee=new mn(26.5,27.5,11.5,72,1,!0),Pe=Ee.attributes.position;for(let C=0;C<Pe.count;C+=1)if(Pe.getY(C)>0){let V=Math.atan2(Pe.getZ(C),Pe.getX(C)),J=3.2+2.8*Math.sin(V*3+.8)+1.5*Math.cos(V*7-.4)+.75*Math.sin(V*13);Pe.setY(C,J)}else Pe.setY(C,-1.8);Ee.computeVertexNormals();let Oe=new wt({color:1715499,side:Vt,fog:!0}),Se=new we(Ee,Oe);We.add(Se),t.push(Ee,Oe);let tt=wy(57),ze=new Rt({map:a,bumpMap:a,bumpScale:.04,vertexColors:!0,roughness:.84,metalness:.08,envMapIntensity:.28});t.push(tt,ze);let mt=[{x:-3.45,z:1.95,sx:.92,sy:.68,sz:.86,yaw:.5,solid:!0},{x:-4.15,z:2.35,sx:.56,sy:.42,sz:.6,yaw:1.9,solid:!1},{x:-.65,z:4.95,sx:.72,sy:.5,sz:.66,yaw:2.4,solid:!0},{x:1.65,z:3.15,sx:.62,sy:.42,sz:.58,yaw:.8,solid:!1},{x:4.95,z:.85,sx:.94,sy:.66,sz:.84,yaw:1.2,solid:!0},{x:3.35,z:-2.15,sx:.76,sy:.52,sz:.7,yaw:2.9,solid:!0}];for(let C=0;C<48;C+=1){let G=Ne()*Math.PI*2,V=2.9+Ne()*8.8,J=Math.cos(G)*V,Q=Math.sin(G)*V;if(Tr(J,Q)>.3||Math.hypot(J-is,Q-ss)<2.4||Math.hypot(J-1.68,Q+1.36)<2.1)continue;let ae=.22+Ne()*.54;mt.push({x:J,z:Q,sx:ae*(.9+Ne()*.4),sy:ae*(.6+Ne()*.38),sz:ae*(.9+Ne()*.4),yaw:Ne()*Math.PI*2,solid:ae>.54})}let N=new Fn(tt,ze,mt.length);N.castShadow=!0,N.receiveShadow=!0,mt.forEach((C,G)=>{let V=Ln(C.x,C.z);Z.position.set(C.x,V+C.sy*.08,C.z),Z.rotation.set((Ne()-.5)*.22,C.yaw,(Ne()-.5)*.22),Z.scale.set(C.sx,C.sy,C.sz),Z.updateMatrix(),N.setMatrixAt(G,Z.matrix),C.solid&&Math.hypot(C.x,C.z)<Gh&&e.push({x:C.x,z:C.z,r:Math.max(C.sx,C.sz)*.46})}),N.instanceMatrix.needsUpdate=!0,We.add(N);let de=Ry(),j=new Rt({map:o,alphaTest:.36,vertexColors:!0,roughness:.84,metalness:.02,side:kt,envMapIntensity:.18});t.push(de,j);let se=[];for(let C=0;C<360;C+=1){let G=Ne()*Math.PI*2,V=1.9+Math.sqrt(Ne())*12.2,J=Math.cos(G)*V,Q=Math.sin(G)*V;if(Tr(J,Q)>.4||Math.hypot(J-is,Q-ss)<2.25||Math.hypot(J-1.65,Q+1.35)<1.55)continue;let ae=Ar(J,Q);if(Math.abs(ae.dist)<.85&&Math.abs(ae.along)<12)continue;let q=Ln(J,Q);se.push({x:J,y:q-.03,z:Q,scale:.72+Ne()*.95,yaw:Ne()*Math.PI*2,phase:Ne()*Math.PI*2})}let fe=new Fn(de,j,Math.max(1,se.length));fe.receiveShadow=!0,se.forEach((C,G)=>{Z.position.set(C.x,C.y,C.z),Z.rotation.set(0,C.yaw,0),Z.scale.setScalar(C.scale),Z.updateMatrix(),fe.setMatrixAt(G,Z.matrix)}),fe.instanceMatrix.needsUpdate=!0,We.add(fe);let me=[],He=new mn(.044,.064,.62,12),Et=new mn(.062,.054,.048,12),Ct=new lo(.068,1),nt=new Ci(.24,.285,32);nt.rotateX(-Math.PI/2);let Dt=new Ci(.28,.34,32);Dt.rotateX(-Math.PI/2);let Ot=new Rt({color:2041387,roughness:.4,metalness:.72});t.push(He,Et,Ct,nt,Dt,Ot);for(let C of wf){let G=Rc(C.x,C.z),V=new Pt;V.position.set(C.x,G,C.z);let J=new we(He,Ot);J.position.y=.31,J.castShadow=!0,V.add(J);let Q=new we(Et,Ot);Q.position.y=.63,V.add(Q);let ae=new Rt({color:16760934,emissive:16096829,emissiveIntensity:1.65,roughness:.16,metalness:.1}),q=new we(Ct,ae);q.position.y=.74,V.add(q);let Te=new Ji({map:p,color:16760420,transparent:!0,opacity:.62,blending:jn,depthWrite:!1}),Re=new Ms(Te);Re.position.y=.74,Re.scale.set(.62,.62,1),V.add(Re);let Ve=new wt({color:16102226,transparent:!0,opacity:.38,side:kt,depthWrite:!1}),dt=new we(nt,Ve);dt.position.y=.015,V.add(dt);let Je=new wt({color:5436104,transparent:!0,opacity:0,side:kt,depthWrite:!1,blending:jn}),Le=new we(Dt,Je);Le.position.y=.018,V.add(Le),s.add(V),t.push(ae,Te,Ve,Je),e.push({x:C.x,z:C.z,r:.12}),me.push({x:C.x,z:C.z,y:G,discovered:!1,activation:0,orbMesh:q,orbMat:ae,glowSprite:Re,glowMat:Te,haloMat:Ve,rippleMesh:Le,rippleMat:Je,ripplePhase:0})}let xn=[{x:-3.2,y:2.8,z:2.8,w:2.6,h:8.8,rotY:-.68,tilt:.36,baseOpacity:.3},{x:-5.4,y:3.1,z:4.8,w:3.2,h:9.6,rotY:-.62,tilt:.38,baseOpacity:.34},{x:-.8,y:2.7,z:4.6,w:2.4,h:8.5,rotY:-.74,tilt:.34,baseOpacity:.24},{x:-5.6,y:3.2,z:.8,w:2.5,h:8.8,rotY:-.6,tilt:.35,baseOpacity:.25},{x:2.4,y:2.9,z:-.6,w:2.3,h:8.4,rotY:-.7,tilt:.33,baseOpacity:.2},{x:-2.4,y:3.1,z:-2.9,w:2.5,h:8.8,rotY:-.66,tilt:.34,baseOpacity:.18}],hn=[];xn.forEach((C,G)=>{let V=new jt(C.w,C.h),J=new wt({map:u,transparent:!0,opacity:C.baseOpacity,blending:jn,depthWrite:!1,side:kt,fog:!1}),Q=new we(V,J);Q.position.set(C.x,C.y,C.z),Q.rotation.set(0,C.rotY,C.tilt),s.add(Q),t.push(V,J),hn.push({mat:J,baseOpacity:C.baseOpacity,phase:G*1.15})});let qt=[{x:-3.2,y:.85,z:4.5,sx:6.5,sy:2.2,phase:0},{x:-5.8,y:1.15,z:2.8,sx:7.2,sy:2.5,phase:1.6},{x:-.4,y:.8,z:6.2,sx:6.2,sy:2.1,phase:3.1},{x:3.8,y:.95,z:2.6,sx:6.4,sy:2.2,phase:4.4}],un=[];for(let C of qt){let G=new Ji({map:d,transparent:!0,opacity:.42,depthWrite:!1,fog:!0}),V=new Ms(G);V.position.set(C.x,C.y,C.z),V.scale.set(C.sx,C.sy,1),s.add(V),t.push(G),un.push({sprite:V,baseX:C.x,baseZ:C.z,phase:C.phase})}let zt=95,zn=new Bt,Ut=new Float32Array(zt*3),yn=new Float32Array(zt*4);for(let C=0;C<zt;C+=1){let G=Ne()*Math.PI*2,V=1.4+Math.sqrt(Ne())*10.2,J=Math.cos(G)*V,Q=Math.sin(G)*V,ae=Rc(J,Q)+.38+Ne()*2.4;Ut[C*3]=J,Ut[C*3+1]=ae,Ut[C*3+2]=Q,yn[C*4]=J,yn[C*4+1]=ae,yn[C*4+2]=Q,yn[C*4+3]=Ne()*Math.PI*2}zn.setAttribute("position",new xt(Ut,3));let Hn=new Qi({map:p,color:16771234,size:.14,transparent:!0,opacity:.78,blending:jn,depthWrite:!1,sizeAttenuation:!0}),gi=new Ss(zn,Hn);s.add(gi),t.push(zn,Hn);let Vs=(C,G,V,J,Q)=>{let ae=Rr(C,G),q=Rr(V,J),Te=Math.abs(ae.lx)<=Dn-.1&&Math.abs(ae.lz)<=ei,Re=ei-.34;if(Te&&Math.abs(q.lx)<=Dn+.05){if(Math.abs(q.lz)>Re){let Ve=Rf(q.lx,vt(q.lz,-Re,Re));return{x:Ve.wx,z:Ve.wz}}}else if(!Te&&Math.abs(q.lx)<=Dn-.12){let Ve=ei+Q*.75;if(Math.abs(q.lz)<Ve&&Math.abs(ae.lz)>=ei-.05){let dt=ae.lz>=0?1:-1,Je=Rf(q.lx,dt*Ve);return{x:Je.wx,z:Je.wz}}}return{x:V,z:J}},ti=!1,tn=[],_i=(C,G)=>{let V=[],J=C.getObjectByName(G);return J&&J.traverse(Q=>{Q.isMesh&&V.push(Q)}),V.length===0&&C.traverse(Q=>{Q.isMesh&&Q.name.startsWith(G)&&V.push(Q)}),V},ni=(C,G)=>{let V=_i(C,G);if(V.length===0)return null;let J=Array.isArray(V[0].material)?V[0].material[0]:V[0].material;return J instanceof Rt?J:null},Sn=(C,G,V)=>{if(!C)return null;let J=C.clone();return J.wrapS=bt,J.wrapT=bt,J.repeat.set(G,V),J.anisotropy=4,J.needsUpdate=!0,t.push(J),J},Ht=C=>{if(ti)return;ti=!0,We.visible=!1;let G=ni(C,"CARRIER_TERRAIN_MOSS")??ni(C,"CARRIER_TERRAIN_PINE");if(G){let oe=Sn(G.map,16,16),it=Sn(G.normalMap,16,16),Xe=Sn(G.roughnessMap,16,16);oe&&(w.map=oe),w.bumpMap=null,it&&(w.normalMap=it,w.normalScale.set(1.15,1.15)),Xe&&(w.roughnessMap=Xe,w.roughness=.96),w.envMapIntensity=.28;let z=g.attributes.color,re=new ge(8950143),he=new ge(9074014),De=new ge(7046238),$e=new ge(3819589),st=new ge(4937545),pt=new ge;for(let Mt=0;Mt<_.count;Mt+=1){let Ye=_.getX(Mt),nn=_.getZ(Mt),kn=Math.hypot(Ye,nn),zi=Tr(Ye,nn),ii=Ar(Ye,nn),Pr=Math.exp(-(ii.dist*ii.dist)/(2*1.1*1.1))*Ft(2.2,3.5,kn),si=.5+.5*Math.sin(Ye*.52+nn*.46);pt.copy(re).lerp(De,si*.52),pt.lerp(he,zi*.56),pt.lerp(st,Ft(5,14,kn)*.58),pt.lerp($e,Pr*.82),z.setXYZ(Mt,pt.r,pt.g,pt.b)}z.needsUpdate=!0,w.needsUpdate=!0}let V=ni(C,"CARRIER_BRIDGE_PLANKS");if(V){let oe=Sn(V.map,1,1),it=Sn(V.normalMap,1,1),Xe=Sn(V.roughnessMap,1,1);oe&&(Y.map=oe),it&&(Y.normalMap=it,Y.normalScale.set(1.25,1.25)),Xe&&(Y.roughnessMap=Xe),Y.color.setHex(12102555),Y.roughness=.9,Y.envMapIntensity=.36,Y.needsUpdate=!0}let J=ni(C,"CARRIER_BRIDGE_TIMBER");if(J){let oe=Sn(J.map,1,2),it=Sn(J.normalMap,1,2),Xe=Sn(J.roughnessMap,1,2);oe&&(ce.map=oe),ce.bumpMap=null,it&&(ce.normalMap=it,ce.normalScale.set(1.2,1.2)),Xe&&(ce.roughnessMap=Xe),ce.color.setHex(8157292),ce.envMapIntensity=.28,ce.needsUpdate=!0}let Q=(oe,it,Xe={})=>{if(it.length===0)return[];let z=_i(C,oe);if(z.length===0)return[];let re=1;if(Xe.normalizeMaxSpan){let De=new rn;for(let pt of z)pt.geometry.computeBoundingBox(),pt.geometry.boundingBox&&De.union(pt.geometry.boundingBox);let $e=new D;De.getSize($e);let st=Math.max($e.x,$e.y,$e.z,.01);re=Xe.normalizeMaxSpan/st}let he=[];for(let De of z){let st=(Array.isArray(De.material)?De.material:[De.material]).map(Mt=>{let Ye=Mt.clone();if(Ye instanceof Rt){let nn=(Ye.name||"").toLowerCase();nn.includes("bough")?(Ye.color.setHex(7178088),Ye.emissive.setHex(1451029),Ye.emissiveIntensity=.62,Ye.envMapIntensity=.24,Ye.alphaTest=.34,Ye.transparent=!1,Ye.depthWrite=!0,Ye.side=kt,Ye.roughness=.95):Xe.isFoliage||nn.includes("fern")||nn.includes("grass")?(Ye.color.multiplyScalar(.88),Ye.emissive.setHex(990222),Ye.emissiveIntensity=.32,Ye.envMapIntensity=.3,Ye.alphaTest=.34,Ye.transparent=!1,Ye.depthWrite=!0,Ye.side=kt,Ye.roughness=.9):(Ye.color.multiplyScalar(.84),Ye.envMapIntensity=.42)}return t.push(Ye),Ye}),pt=new Fn(De.geometry,st.length===1?st[0]:st,it.length);pt.castShadow=Xe.castShadow!==!1,pt.receiveShadow=Xe.receiveShadow!==!1,it.forEach((Mt,Ye)=>{Z.position.set(Mt.x,Mt.y,Mt.z),Z.rotation.set(Mt.rx??0,Mt.ry,Mt.rz??0),Z.scale.set(Mt.sx*re,Mt.sy*re,Mt.sz*re),Z.updateMatrix(),pt.setMatrixAt(Ye,Z.matrix)}),pt.instanceMatrix.needsUpdate=!0,le.add(pt),he.push(pt)}return he},ae=wr(998811),q=et.filter(oe=>oe.variant===0).map(oe=>({x:oe.x,y:Ln(oe.x,oe.z)-.14,z:oe.z,sx:oe.scale*.92,sy:oe.scale*(.94+ae()*.16),sz:oe.scale*.92,rx:(ae()-.5)*.035,ry:oe.yaw,rz:(ae()-.5)*.035})),Te=et.filter(oe=>oe.variant===1).map(oe=>({x:oe.x,y:Ln(oe.x,oe.z)-.14,z:oe.z,sx:oe.scale*.92,sy:oe.scale*(.94+ae()*.18),sz:oe.scale*.92,rx:(ae()-.5)*.035,ry:oe.yaw,rz:(ae()-.5)*.035}));Q("KIT_TREE_TALL_A",q,{castShadow:!0,receiveShadow:!0}),Q("KIT_TREE_TALL_B",Te,{castShadow:!0,receiveShadow:!0});let Re=[];for(let oe=0;oe<18;oe+=1){let it=ae()*Math.PI*2,Xe=3.8+ae()*7.8,z=Math.cos(it)*Xe,re=Math.sin(it)*Xe;if(Tr(z,re)>.34||Math.hypot(z-is,re-ss)<2.8||Math.hypot(z-1.85,re+1.5)<2.6)continue;let he=Ar(z,re);if(Math.abs(he.dist)<1.25&&Math.abs(he.along)<12)continue;let De=.72+ae()*.48;Re.push({x:z,y:Ln(z,re)-.06,z:re,sx:De,sy:De,sz:De,ry:ae()*Math.PI*2})}Q("KIT_SAPLING_01",Re,{castShadow:!0,receiveShadow:!0});let Ve={KIT_ROCK_MOSS_01:[],KIT_ROCK_MOSS_02:[],KIT_ROCK_MOSS_03:[],KIT_ROCK_MOSS_04:[],KIT_BOULDER_01:[]},dt=Object.keys(Ve);mt.forEach((oe,it)=>{let Xe=it===0||it===4?"KIT_BOULDER_01":dt[it%4],z=Ln(oe.x,oe.z),re=Math.max(oe.sx,oe.sz)*1.12;Ve[Xe].push({x:oe.x,y:z-.05,z:oe.z,sx:re,sy:re*(.78+ae()*.25),sz:re,rx:(ae()-.5)*.14,ry:oe.yaw,rz:(ae()-.5)*.14})});for(let[oe,it]of Object.entries(Ve))Q(oe,it,{castShadow:!0,receiveShadow:!0,normalizeMaxSpan:1});Q("KIT_STUMP_01",[{x:-.55,z:3.15,s:.92,ry:.6},{x:3.15,z:-2.45,s:.88,ry:2.1},{x:-4.85,z:-.45,s:1.05,ry:3.8},{x:4.95,z:2.35,s:.95,ry:1.4}].map(oe=>({x:oe.x,y:Ln(oe.x,oe.z)-.04,z:oe.z,sx:oe.s,sy:oe.s,sz:oe.s,ry:oe.ry})),{castShadow:!0,receiveShadow:!0,normalizeMaxSpan:.95}),Q("KIT_FALLEN_LOG",[{x:-4.65,z:2.85,s:2.25,ry:.65},{x:4.25,z:-2.95,s:2.1,ry:-.85},{x:1.65,z:5.55,s:2.4,ry:1.95}].map(oe=>({x:oe.x,y:Ln(oe.x,oe.z)-.06,z:oe.z,sx:oe.s,sy:oe.s,sz:oe.s,ry:oe.ry})),{castShadow:!0,receiveShadow:!0,normalizeMaxSpan:1}),Q("KIT_PINE_ROOTS",[{x:-5.25,z:2.1,s:1.45,ry:.9},{x:-3.95,z:6.85,s:1.55,ry:2.4},{x:5.65,z:1.95,s:1.4,ry:4.1}].map(oe=>({x:oe.x,y:Ln(oe.x,oe.z)-.04,z:oe.z,sx:oe.s,sy:oe.s,sz:oe.s,ry:oe.ry})),{castShadow:!0,receiveShadow:!0,normalizeMaxSpan:1});let at=[],an=[],cn=[],Zt=[];se.forEach((oe,it)=>{let Xe=it%4,z={x:oe.x,y:oe.y-.01,z:oe.z,scale:oe.scale*.95,yaw:oe.yaw,phase:oe.phase};Xe===0?at.push(z):Xe===1?an.push(z):Xe===2?cn.push({...z,scale:oe.scale*.68}):Zt.push({...z,scale:oe.scale*.65})});let Un=[["KIT_FERN_01",at,1.05],["KIT_FERN_02",an,1.02],["KIT_GRASS_01",cn,.78],["KIT_GRASS_02",Zt,.72]];for(let[oe,it,Xe]of Un){let z=Q(oe,it.map(re=>({x:re.x,y:re.y,z:re.z,sx:re.scale,sy:re.scale,sz:re.scale,ry:re.yaw})),{castShadow:!1,receiveShadow:!0,isFoliage:!0,normalizeMaxSpan:Xe});if(z.length>0){let re=new rn;z[0].geometry.computeBoundingBox(),z[0].geometry.boundingBox&&re.copy(z[0].geometry.boundingBox);let he=new D;re.getSize(he);let De=Xe/Math.max(he.x,he.y,he.z,.01);for(let $e of z)tn.push({inst:$e,entries:it.map(st=>({...st,scale:st.scale*De}))})}}},E=new ge(16098370),B=new ge(5173960),X=new ge,K=0;return{group:s,arenaRadius:Gh,sampleHeight:Rc,constrainPosition:Vs,colliders:e,applyPhotorealKit:Ht,isPhotorealLoaded:()=>ti,getDiscoveredBeacons:()=>me.reduce((C,G)=>C+(G.discovered?1:0),0),getTotalBeacons:()=>me.length,update:(C,G,V,J)=>{let Q=G*.001;l.map.offset.y=-Q*.14,l.bumpMap.offset.y=-Q*.18,$.emissiveIntensity=.24+Math.sin(Q*2.1)*.07;for(let q of hn)q.mat.opacity=q.baseOpacity*(.88+.14*Math.sin(Q*.65+q.phase));for(let q of un)q.sprite.position.x=q.baseX+Math.sin(Q*.14+q.phase)*.65,q.sprite.position.z=q.baseZ+Math.cos(Q*.11+q.phase)*.45;let ae=zn.attributes.position;for(let q=0;q<zt;q+=1){let Te=yn[q*4],Re=yn[q*4+1],Ve=yn[q*4+2],dt=yn[q*4+3];ae.setXYZ(q,Te+Math.sin(Q*.45+dt)*.34,Re+Math.sin(Q*.85+dt*1.7)*.2,Ve+Math.cos(Q*.42+dt*1.3)*.34)}if(ae.needsUpdate=!0,K=K+1&1,K===0)if(ti)for(let q of tn){for(let Te=0;Te<q.entries.length;Te+=1){let Re=q.entries[Te],Ve=Math.sin(Q*1.5+Re.phase)*.04;Z.position.set(Re.x,Re.y,Re.z),Z.rotation.set(Ve,Re.yaw,Ve*.6),Z.scale.setScalar(Re.scale),Z.updateMatrix(),q.inst.setMatrixAt(Te,Z.matrix)}q.inst.instanceMatrix.needsUpdate=!0}else{for(let q=0;q<se.length;q+=1){let Te=se[q],Re=Math.sin(Q*1.6+Te.phase)*.05;Z.position.set(Te.x,Te.y,Te.z),Z.rotation.set(Re,Te.yaw,Re*.65),Z.scale.setScalar(Te.scale),Z.updateMatrix(),fe.setMatrixAt(q,Z.matrix)}fe.instanceMatrix.needsUpdate=!0}for(let q of me){Math.hypot(V-q.x,J-q.z)<1.72&&!q.discovered&&(q.discovered=!0,q.ripplePhase=.001);let Re=q.discovered?1:0;if(q.activation+=(Re-q.activation)*(1-Math.exp(-5*C)),X.copy(E).lerp(B,q.activation),q.orbMat.color.copy(X),q.orbMat.emissive.copy(X),q.orbMat.emissiveIntensity=1.45+q.activation*1.25+Math.sin(Q*3.1+q.x)*.25,q.orbMesh.rotation.y=Q*(.9+q.activation*1.8),q.orbMesh.position.y=.74+Math.sin(Q*2.2+q.z)*.028,q.glowMat.color.copy(X),q.glowMat.opacity=.56+q.activation*.34,q.glowSprite.position.y=q.orbMesh.position.y,q.haloMat.color.copy(X),q.haloMat.opacity=.34+q.activation*.44,q.ripplePhase>0)if(q.ripplePhase+=C*1.15,q.ripplePhase>=1)q.ripplePhase=0,q.rippleMat.opacity=0;else{let Ve=1+q.ripplePhase*4;q.rippleMesh.scale.set(Ve,Ve,1),q.rippleMat.opacity=(1-q.ripplePhase)*.8}}},dispose:()=>{for(let C of t)C.dispose()}}}var Xh={forest:{bgHex:3293242,fogDensity:.036,floorHex:1977378,floorRoughness:.9,floorMetalness:.03,floorGridColor:"rgba(160, 212, 184, 0.08)",floorFineColor:"rgba(130, 180, 152, 0.03)",ringPrimary:"rgba(196, 245, 224, 0.84)",ringSecondary:"rgba(232, 206, 148, 0.48)",ringGlowHex:10348748,accentEmissiveHex:7137470,spotColor:16772304,spotIntensity:0,rimColor:10667714,rimIntensity:.36,fillColor:9348762,fillIntensity:0,hemiSky:11716800,hemiGround:2765600,hemiIntensity:.42,envIntensity:.95,exposure:1,showGalleryWalls:!1,showHangarRibs:!1},charcoal:{bgHex:395533,fogDensity:.165,floorHex:922395,floorRoughness:.76,floorMetalness:.1,floorGridColor:"rgba(148, 190, 228, 0.095)",floorFineColor:"rgba(120, 155, 192, 0.038)",ringPrimary:"rgba(222, 242, 255, 0.96)",ringSecondary:"rgba(146, 200, 244, 0.56)",ringGlowHex:10013951,accentEmissiveHex:9226495,spotColor:15660543,spotIntensity:27,rimColor:8568831,rimIntensity:1.65,fillColor:8689842,fillIntensity:.42,hemiSky:5531776,hemiGround:395533,hemiIntensity:.2,envIntensity:.5,exposure:1.04,showGalleryWalls:!1,showHangarRibs:!1},gallery:{bgHex:1317152,fogDensity:.105,floorHex:2501942,floorRoughness:.62,floorMetalness:.08,floorGridColor:"rgba(205, 222, 242, 0.14)",floorFineColor:"rgba(180, 200, 224, 0.05)",ringPrimary:"rgba(235, 246, 255, 0.96)",ringSecondary:"rgba(176, 212, 242, 0.62)",ringGlowHex:12771583,accentEmissiveHex:13690106,spotColor:16777215,spotIntensity:42,rimColor:12770554,rimIntensity:1.45,fillColor:11977940,fillIntensity:.72,hemiSky:9609908,hemiGround:1448738,hemiIntensity:.48,envIntensity:.64,exposure:1.1,showGalleryWalls:!0,showHangarRibs:!1},hangar:{bgHex:330256,fogDensity:.12,floorHex:1120806,floorRoughness:.48,floorMetalness:.28,floorGridColor:"rgba(92, 216, 255, 0.16)",floorFineColor:"rgba(72, 184, 226, 0.06)",ringPrimary:"rgba(156, 240, 255, 0.98)",ringSecondary:"rgba(80, 198, 238, 0.68)",ringGlowHex:5169407,accentEmissiveHex:5431551,spotColor:14480639,spotIntensity:36,rimColor:4510463,rimIntensity:2.35,fillColor:7117496,fillIntensity:.56,hemiSky:5015726,hemiGround:396565,hemiIntensity:.34,envIntensity:.58,exposure:1.05,showGalleryWalls:!1,showHangarRibs:!0}},Po=-.68,Cy=1.24,Iy=1.44,Py=2.02,Ly=2.28,Of=.34,zf=1.5,Hf=1.18,kf=4.6,Dy=.255,Uy=.38,Ny=.5,Fy=.095,Gf=.265,Kh=6.35,ks=.255,Cr=.247,Uc=.3891,Xf=2.85,Yf=-1.65,Jh=-.25,Ir=.72,$h=.65,Lo=.78,jh=1.05,qf=.19,Zf=-3.15,Kf=-2.35,Qh=.42,Nc=.85,Gs=1.15,Jf=.048,$f=[{x:2.35,z:1.95,r:.11},{x:-.35,z:-3.05,r:.11},{x:-2.95,z:-1.65,r:.11},{x:.55,z:3.15,r:.11}];function Vf(s){return s==="forest"||s==="charcoal"||s==="gallery"||s==="hangar"?s:"forest"}function Wt(s,e,t){return Math.max(e,Math.min(t,s))}function Yh(s){let e=s;for(;e>Math.PI;)e-=Math.PI*2;for(;e<-Math.PI;)e+=Math.PI*2;return e}function qh(s){let e=atob(s),t=e.length,n=new Uint8Array(t);for(let i=0;i<t;i+=1)n[i]=e.charCodeAt(i);return n.buffer}function jf(s,e){let t=Lo+jh,n=Ir+$h,i=Math.abs(s),r=Math.abs(e);if(i>=t||r>=n)return 0;let o=i<=Lo?1:Wt(1-(i-Lo)/jh,0,1),a=r<=Ir?1:Wt(1-(r-Ir)/$h,0,1),c=o*o*(3-2*o),l=a*a*(3-2*a);return qf*c*l}function By(s,e){let t=0,n=s-Xf,i=e-Yf,r=Math.cos(-Jh),o=Math.sin(-Jh),a=n*r-i*o,c=n*o+i*r;t=Math.max(t,jf(a,c));let l=s-Zf,h=e-Kf,u=Math.cos(-Qh),d=Math.sin(-Qh),p=l*u-h*d,g=l*d+h*u;if(Math.abs(g)<=Nc&&Math.abs(p)<=Gs){let _=.5*(1+Math.cos(p/Gs*Math.PI*5)),m=Math.cos(p/Gs*(Math.PI/2));t=Math.max(t,Jf*_*Math.max(0,m))}return t}function Wf(s,e,t){let n=ks+Cr-.012,i=.135,r=Math.hypot(e,t);if(r>n){let u=n/r;e*=u,t*=u,r=n}else r<i&&(r=i);let o=Wt((ks*ks+Cr*Cr-r*r)/(2*ks*Cr),-.999,.999),a=Math.acos(o),c=Wt((ks*ks+r*r-Cr*Cr)/(2*ks*r),-.999,.999),l=Math.acos(c),h=Math.atan2(e,-t);return s?{thighAbs:h-l,calfRel:Math.PI-a}:{thighAbs:h+l,calfRel:-(Math.PI-a)}}function Oy(s,e){let n=document.createElement("canvas");n.width=512,n.height=512;let i=n.getContext("2d");if(i){i.fillStyle="#ffffff",i.fillRect(0,0,512,512);for(let c=0;c<1800;c+=1){let l=Math.sin(c*12.9898)*43758.5453%1,h=Math.sin(c*78.233)*43758.5453%1,u=Math.abs(l)*512,d=Math.abs(h)*512,p=1+c%3;i.fillStyle=c%2===0?"rgba(0,0,0,0.035)":"rgba(255,255,255,0.025)",i.fillRect(u,d,p,p)}i.strokeStyle=e,i.lineWidth=1;let o=512/2;i.beginPath(),i.moveTo(o,0),i.lineTo(o,512),i.moveTo(0,o),i.lineTo(512,o),i.stroke(),i.strokeStyle=s,i.lineWidth=2,i.strokeRect(.5,.5,511,511),i.strokeStyle=s,i.lineWidth=2;let a=14;i.beginPath(),i.moveTo(0,a),i.lineTo(0,0),i.lineTo(a,0),i.stroke()}let r=new Lt(n);return r.colorSpace=ct,r.wrapS=bt,r.wrapT=bt,r.repeat.set(22,22),r.anisotropy=4,r.needsUpdate=!0,r}function zy(s,e,t){let i=document.createElement("canvas");i.width=1024,i.height=1024;let r=i.getContext("2d");if(r){r.clearRect(0,0,1024,1024);let l=r.createRadialGradient(512,512,1024*.04,512,512,1024*.47);l.addColorStop(0,t?"rgba(84, 178, 222, 0.16)":"rgba(148, 178, 210, 0.15)"),l.addColorStop(.7,t?"rgba(54, 128, 168, 0.09)":"rgba(116, 146, 178, 0.08)"),l.addColorStop(.94,"rgba(60, 90, 120, 0.02)"),l.addColorStop(1,"rgba(0, 0, 0, 0)"),r.fillStyle=l,r.beginPath(),r.arc(512,512,1024*.47,0,Math.PI*2),r.fill(),r.save(),r.shadowColor=s,r.shadowBlur=20,r.strokeStyle=s,r.lineWidth=4.4,r.beginPath(),r.arc(512,512,1024*.365,0,Math.PI*2),r.stroke(),r.restore(),r.save(),r.shadowColor=e,r.shadowBlur=12,r.strokeStyle=e,r.lineWidth=2.4,r.beginPath(),r.arc(512,512,1024*.445,0,Math.PI*2),r.stroke(),r.restore(),r.strokeStyle=e,r.lineWidth=1.6;for(let p=0;p<4;p+=1){let g=p*Math.PI/2;r.beginPath(),r.moveTo(512+Math.cos(g)*1024*.448,512+Math.sin(g)*1024*.448),r.lineTo(512+Math.cos(g)*1024*.48,512+Math.sin(g)*1024*.48),r.stroke()}r.save(),r.translate(512-1024*.14,512-1024*.25),r.rotate(-2.25),r.fillStyle=t?"rgba(186, 240, 255, 0.78)":"rgba(226, 236, 248, 0.72)",r.font='700 42px "Segoe UI", "Helvetica Neue", Arial, sans-serif',r.textAlign="center",r.textBaseline="middle";let h=["D","O","S","O"],u=44,d=-((h.length-1)*u)/2;h.forEach((p,g)=>{r.fillText(p,d+g*u,0)}),r.restore()}let o=new Lt(i);return o.colorSpace=ct,o.anisotropy=4,o.needsUpdate=!0,o}function Hy(){let e=document.createElement("canvas");e.width=256,e.height=256;let t=e.getContext("2d");if(t){t.clearRect(0,0,256,256);let i=t.createRadialGradient(256*.16,256*.5,4,256*.45,256*.5,256*.5);i.addColorStop(0,"rgba(210, 238, 255, 0.42)"),i.addColorStop(.45,"rgba(155, 210, 255, 0.16)"),i.addColorStop(1,"rgba(120, 190, 255, 0)"),t.fillStyle=i,t.beginPath(),t.moveTo(256*.08,256*.44),t.lineTo(256*.96,256*.08),t.lineTo(256*.96,256*.92),t.lineTo(256*.08,256*.56),t.closePath(),t.fill()}let n=new Lt(e);return n.colorSpace=ct,n.needsUpdate=!0,n}function ky(){let e=document.createElement("canvas");e.width=256,e.height=256;let t=e.getContext("2d");if(t){t.clearRect(0,0,256,256);let o=t.createRadialGradient(128,128,10,128,128,256*.46);o.addColorStop(0,"rgba(2, 4, 8, 0.62)"),o.addColorStop(.55,"rgba(2, 4, 8, 0.24)"),o.addColorStop(1,"rgba(2, 4, 8, 0)"),t.fillStyle=o,t.beginPath(),t.ellipse(128,128,256*.44,256*.34,0,0,Math.PI*2),t.fill()}let n=new Lt(e);return n.colorSpace=ct,n.needsUpdate=!0,n}function Zh(s,e,t){let n=document.createElement("canvas");n.width=4,n.height=256;let i=n.getContext("2d");if(i){let o=i.createLinearGradient(0,0,0,256);o.addColorStop(0,s),o.addColorStop(.46,e),o.addColorStop(.6,t),o.addColorStop(1,s),i.fillStyle=o,i.fillRect(0,0,4,256)}let r=new Lt(n);return r.colorSpace=ct,r.needsUpdate=!0,r}function Gy(){let s=new Pt,e=[],t=new wt({color:9226495,transparent:!0,opacity:.85});e.push(t);let n=new wt({color:9226495,transparent:!0,opacity:.32,side:kt,depthWrite:!1});e.push(n);let i=new Rt({color:1580840,roughness:.62,metalness:.25}),r=new Pt;r.position.set(Xf,0,Yf),r.rotation.y=Jh;let o=(Lo+jh)*2,a=(Ir+$h)*2,c=new jt(o,a,44,28);c.rotateX(-Math.PI/2);let l=c.attributes.position;for(let I=0;I<l.count;I+=1){let F=l.getX(I),U=l.getZ(I);l.setY(I,jf(F,U)+.002)}c.computeVertexNormals();let h=new we(c,i);h.receiveShadow=!0,h.castShadow=!0,r.add(h);for(let I of[-Ir,Ir]){let F=new we(new pn(Lo*2,.01,.02),t);F.position.set(0,qf+.006,I*.98),r.add(F)}s.add(r);let u=new Pt;u.position.set(Zf,0,Kf),u.rotation.y=Qh;let d=new jt(Gs*2,Nc*2,48,1);d.rotateX(-Math.PI/2);let p=d.attributes.position;for(let I=0;I<p.count;I+=1){let F=p.getX(I),U=.5*(1+Math.cos(F/Gs*Math.PI*5)),O=Math.max(0,Math.cos(F/Gs*(Math.PI/2)));p.setY(I,Jf*U*O+.002)}d.computeVertexNormals();let g=new we(d,i);g.receiveShadow=!0,g.castShadow=!0,u.add(g);for(let I of[-Nc,Nc]){let F=new we(new pn(Gs*2,.008,.018),n);F.position.set(0,.006,I),u.add(F)}s.add(u);let _=new mn(.088,.105,.42,24),m=new uo(.092,.009,10,28);m.rotateX(Math.PI/2);let f=new Ci(.14,.165,28);f.rotateX(-Math.PI/2);for(let I of $f){let F=new Pt;F.position.set(I.x,0,I.z);let U=new we(_,i);U.position.y=.21,U.castShadow=!0,U.receiveShadow=!0,F.add(U);let O=new we(m,t);O.position.y=.37,F.add(O);let $=new we(f,n);$.position.y=.003,F.add($),s.add(F)}let v=new we(new Ci(Kh-.02,Kh,96),n);v.rotation.x=-Math.PI/2,v.position.y=.003,s.add(v);let S=new Pt,x=new Rt({color:2106927,roughness:.88,metalness:.05}),P=new wt({color:14412542,transparent:!0,opacity:.68}),T=8.4;for(let I=0;I<10;I+=1){let F=(I+.5)/10*Math.PI*2,U=new we(new pn(4.2,4.2,.18),x);U.position.set(Math.cos(F)*T,2.05,Math.sin(F)*T),U.lookAt(0,2.05,0),S.add(U);let O=F+Math.PI/10,$=new we(new jt(.1,3.2),P);$.position.set(Math.cos(O)*(T-.14),1.65,Math.sin(O)*(T-.14)),$.lookAt(0,1.65,0),S.add($)}S.visible=!1;let w=new Pt,R=new Rt({color:791325,roughness:.62,metalness:.36}),M=new wt({color:7136511,transparent:!0,opacity:.78}),y=8.2;for(let I=0;I<10;I+=1){let F=(I+.35)/10*Math.PI*2,U=new we(new pn(.36,4.4,.42),R);U.position.set(Math.cos(F)*y,2.15,Math.sin(F)*y),U.lookAt(0,2.15,0),w.add(U);let O=F+Math.PI/10;for(let $ of[.72,1.56]){let k=new we(new jt(3.6,$<1?.065:.036),M);k.position.set(Math.cos(O)*(y-.1),$,Math.sin(O)*(y-.1)),k.lookAt(0,$,0),w.add(k)}}return w.visible=!1,{propsGroup:s,accentMats:e,galleryGroup:S,hangarGroup:w}}function Qf(s,e={}){let t=Vf(e.scene),n=e.accentTone==="fsdBlue"?"fsdBlue":"graphite",i=e.interactive!==!1,r=!!e.paused,o=e.performanceTier==="low",a=!1,c=!1,l=!1,h=0,u=0,d=0,p=0,g=0,_=0,m=0,f=0,v=0,S=0,x=0,P=0,T=0,w=0,R=0,M=0,y=0,I=0,F=!1,U=0,O=z=>{l!==z&&(l=z,e.onUserMovedChange?.(z))},$=z=>{typeof z=="number"&&Number.isFinite(z)?h=Wt((z-Ny)*.55,-.095,.065):h=0};$(e.bodyHeightM);let k=new bc({canvas:s,antialias:!o,alpha:!1,powerPreference:o?"low-power":"high-performance"});k.outputColorSpace=ct,k.toneMapping=Ba,k.shadowMap.enabled=!o,o||(k.shadowMap.type=Ca),k.setPixelRatio(o?1:Math.min(typeof window<"u"&&window.devicePixelRatio||1,2));let ee=new ys,Y=Xh[t];ee.background=new ge(Y.bgHex);let ce=new Qr(Y.bgHex,Y.fogDensity);ee.fog=ce;let pe=new Mr(k),Ie=pe.fromScene(new wc,.04).texture,Ue=null,Ge=null;ee.environment=Ie;let te=new Yt(34,16/9,.08,65),ue=new ho(32,36,22),Ae=new wt({side:Vt,depthWrite:!1,fog:!1}),ye=new we(ue,Ae);ee.add(ye);let Be=new ro(14,72),qe=new Rt({color:Y.floorHex,roughness:Y.floorRoughness,metalness:Y.floorMetalness,envMapIntensity:.08}),Fe=new we(Be,qe);Fe.rotation.x=-Math.PI/2,Fe.receiveShadow=!o,ee.add(Fe);let Ne=new jt(1.8,1.8),et=new wt({transparent:!0,depthWrite:!1,opacity:.96}),Ke=new we(Ne,et);Ke.rotation.x=-Math.PI/2,Ke.position.y=.003,ee.add(Ke);let{propsGroup:L,accentMats:on,galleryGroup:rt,hangarGroup:ot}=Gy();ee.add(L),ee.add(rt),ee.add(ot);let ve=null,gt=()=>(ve||(ve=Bf(),ee.add(ve.group)),ve);t==="forest"&&gt();let Ce=(z,re)=>t==="forest"&&ve?ve.sampleHeight(z,re):By(z,re),A=()=>t==="forest"&&ve?ve.colliders:$f,b=()=>t==="forest"&&ve?ve.arenaRadius:Kh,W=new go(Y.hemiSky,Y.hemiGround,Y.hemiIntensity);ee.add(W);let ie=new St;ie.position.set(0,.25,0),ee.add(ie);let ne=new ws(Y.spotColor,Y.spotIntensity,11.5,Math.PI/4.2,.9,1.65);ne.position.set(1.15,3.55,-1.05),ne.target=ie,ne.castShadow=!o,o||(ne.shadow.mapSize.set(1024,1024),ne.shadow.camera.near=.6,ne.shadow.camera.far=10,ne.shadow.bias=-4e-4,ne.shadow.normalBias=.015,ne.shadow.radius=4),ee.add(ne);let Z=new St;Z.position.set(0,.2,0),ee.add(Z);let xe=new ui(16773596,2.45);xe.position.set(4.8,9.2,-5.4),xe.target=Z,xe.castShadow=!o,o||(xe.shadow.mapSize.set(2048,2048),xe.shadow.camera.left=-5.5,xe.shadow.camera.right=5.5,xe.shadow.camera.top=5.5,xe.shadow.camera.bottom=-5.5,xe.shadow.camera.near=1,xe.shadow.camera.far=26,xe.shadow.bias=-25e-5,xe.shadow.normalBias=.014,xe.shadow.radius=2.5),ee.add(xe);let _e=new ui(16769464,0);_e.position.set(3.8,2.2,-3.2),ee.add(_e);let be=new ui(Y.rimColor,Y.rimIntensity);be.position.set(-2.6,2,2.2),ee.add(be);let We=new ui(Y.fillColor,Y.fillIntensity);We.position.set(2.2,.9,1.8),ee.add(We);let le=new Pt;ee.add(le);let Ee=ky(),Pe=new we(new jt(1.12,.86),new wt({map:Ee,transparent:!0,depthWrite:!1,opacity:.85}));Pe.rotation.x=-Math.PI/2,Pe.position.y=.005,le.add(Pe);let Oe=Hy(),Se=new we(new jt(1.95,1.25),new wt({map:Oe,transparent:!0,depthWrite:!1,blending:jn,opacity:.42}));Se.rotation.x=-Math.PI/2,Se.position.set(1.22,.007,0),le.add(Se);let tt=new Pt;le.add(tt);let ze=null,mt=.4917,N=[],de=null,j=null,se=null,fe=()=>{let z=Xh[t],re=n==="fsdBlue",he=t==="forest";ee.background=new ge(z.bgHex),ce.color.setHex(z.bgHex),ce.density=z.fogDensity,Fe.visible=!he,Ke.visible=!he,L.visible=!he,he?gt().group.visible=!0:ve&&(ve.group.visible=!1),qe.color.setHex(z.floorHex),qe.roughness=z.floorRoughness,qe.metalness=z.floorMetalness,ne.color.setHex(z.spotColor),ne.intensity=z.spotIntensity,ne.visible=!he,ne.castShadow=!o&&!he,xe.visible=he,xe.castShadow=!o&&he,_e.visible=!1,be.color.setHex(re&&!he?5416191:z.rimColor),be.intensity=re&&!he?z.rimIntensity*1.15:z.rimIntensity,be.visible=z.rimIntensity>.01,We.color.setHex(z.fillColor),We.intensity=z.fillIntensity,We.visible=!he,Se.visible=!he,Pe.material.opacity=he?.54:.85,W.color.setHex(z.hemiSky),W.groundColor.setHex(z.hemiGround),W.intensity=z.hemiIntensity,k.toneMappingExposure=z.exposure;let De=re?5416703:z.accentEmissiveHex;for(let nn of on)nn.color.setHex(De);rt.visible=z.showGalleryWalls,ot.visible=z.showHangarRibs;let $e=he?Ge??Nf():t==="gallery"?Zh("#0c1016","#171d26","#212934"):t==="hangar"?Zh("#03060a","#070f19","#0d1b2a"):Zh("#040609","#090d14","#101721");de&&de!==Ge&&de.dispose(),de=$e,Ae.map=$e,Ae.needsUpdate=!0,ye.rotation.y=he?.95:0,ee.environment=he&&Ue?Ue:Ie;let st=Oy(re?"rgba(92, 168, 255, 0.14)":z.floorGridColor,z.floorFineColor);j&&j.dispose(),j=st,qe.map=st,qe.needsUpdate=!0;let pt=re?"rgba(130, 198, 255, 0.96)":z.ringPrimary,Mt=re?"rgba(66, 154, 255, 0.68)":z.ringSecondary,Ye=zy(pt,Mt,t==="hangar");se&&se.dispose(),se=Ye,et.map=Ye,et.needsUpdate=!0,tt.traverse(nn=>{if(nn.isMesh){let kn=nn.material,zi=Array.isArray(kn)?kn:[kn];for(let ii of zi)ii&&"envMapIntensity"in ii&&(ii.envMapIntensity=z.envIntensity)}})};fe();let me=()=>t==="forest"?Ly:Py,He=()=>t==="forest"?Iy:Cy,Et=()=>t==="forest"?Uy:Dy,Ct=Po,nt=He(),Dt=me(),Ot=Po,xn=He(),hn=me(),qt=0,un=0,zt=new D(0,Et(),0),zn=()=>{let z=Math.sin(nt),re=zt.x+Dt*z*Math.cos(Ct),he=zt.z+Dt*z*Math.sin(Ct),De=Ce(re,he)+.24;te.position.set(re,Math.max(De,zt.y+Dt*Math.cos(nt)),he),te.lookAt(zt)};zn();let Ut=0,yn=performance.now(),Hn=0,gi=3,Vs=33,ti=()=>{},tn=(z=4)=>{gi=Math.max(gi,z),!a&&!r&&!Ut&&(yn=performance.now(),ti())},_i=(z,re)=>{if(a)return;let he=s.parentElement,De=Math.max(1,Math.round(z??he?.clientWidth??s.clientWidth??window.innerWidth??800)),$e=Math.max(1,Math.round(re??he?.clientHeight??s.clientHeight??window.innerHeight??450));k.setSize(De,$e,!1),te.aspect=De/$e;let st=t==="forest"?39:34;te.fov=te.aspect>2.05?st+2:te.aspect<1.55?st+4:st,te.updateProjectionMatrix(),tn(2)};_i();let ni=()=>{_=0,m=Ce(0,0),f=0,v=0,S=0,x=0,P=0,T=0,w=0,R=0,M=0,y=0,F=!1,tn(4)},Sn=()=>{Math.hypot(S,x)<.04&&Math.hypot(_,f)>.35&&ni(),Ot=Po,xn=He(),hn=me(),qt=0,un=0,U=0,O(!1),tn(6)},Ht=new Map,E=!1,B=0,X=0,K=0,H=0,C=0,G=null,V=0,J=0,Q=0,ae=()=>{if(Ht.size<2)return null;let z=Array.from(Ht.values());return Math.hypot(z[0].x-z[1].x,z[0].y-z[1].y)},q=z=>{if(!(!i||a)&&!(z.pointerType==="mouse"&&z.button!==0)){try{s.setPointerCapture(z.pointerId)}catch{}Ht.set(z.pointerId,{x:z.clientX,y:z.clientY}),Ht.size===1?(E=!0,B=z.clientX,X=z.clientY,K=z.clientX,H=z.clientY,C=0,qt=0,un=0,G=null,U=3.2,s.style.cursor="grabbing"):Ht.size===2&&(E=!1,qt=0,un=0,U=3.2,G=ae()),tn(6)}},Te=z=>{if(!(!i||a||!Ht.has(z.pointerId))){if(Ht.set(z.pointerId,{x:z.clientX,y:z.clientY}),Ht.size===1&&E){let re=z.clientX-B,he=z.clientY-X;B=z.clientX,X=z.clientY,C+=Math.hypot(re,he);let De=Math.max(320,s.clientWidth||window.innerWidth||800),$e=Math.max(240,s.clientHeight||window.innerHeight||400),st=re/De*Math.PI*1.85,pt=-(he/$e)*Math.PI*.95;Ot+=st,xn=Wt(xn+pt,Of,zf),qt=st*.72,un=pt*.48,U=3.2,C>6&&O(!0),tn(6)}else if(Ht.size===2){let re=ae();if(re!==null&&G!==null&&G>12){let he=G/Math.max(12,re);hn=Wt(hn*he,Hf,kf),U=3.2,O(!0),tn(6)}G=re}}},Re=z=>{if(Ht.has(z.pointerId)){Ht.delete(z.pointerId);try{s.hasPointerCapture(z.pointerId)&&s.releasePointerCapture(z.pointerId)}catch{}if(Ht.size===0){let re=performance.now();if(C<10){let he=re-V,De=Math.hypot(z.clientX-J,z.clientY-Q);he>20&&he<300&&De<28?(Sn(),V=0):(V=re,J=K,Q=H)}E=!1,G=null,s.style.cursor=i?"grab":"default"}else if(Ht.size===1){let re=Array.from(Ht.values())[0];B=re.x,X=re.y,E=!0,G=null}}},Ve=z=>{if(!i||a)return;z.preventDefault();let re=1+Wt(z.deltaY*.0012,-.18,.18);hn=Wt(hn*re,Hf,kf),U=3.2,O(!0),tn(6)};s.style.touchAction="none",s.style.userSelect="none",s.style.cursor=i?"grab":"default",s.addEventListener("pointerdown",q),s.addEventListener("pointermove",Te),s.addEventListener("pointerup",Re),s.addEventListener("pointercancel",Re),s.addEventListener("wheel",Ve,{passive:!1});let dt=()=>_i();typeof window<"u"&&window.addEventListener("resize",dt);let Je=z=>{N.length=0,ze=z.getObjectByName("R50_BODY")??null,ze&&(mt=ze.position.y);let re=[{id:"FL",isFront:!0,isLeft:!0,footX:.319,footZ:-.265,hipAxisX:-1,pitchAxisY:.099833},{id:"FR",isFront:!0,isLeft:!1,footX:.319,footZ:.265,hipAxisX:-1,pitchAxisY:-.099833},{id:"RL",isFront:!1,isLeft:!0,footX:-.324,footZ:-.265,hipAxisX:1,pitchAxisY:.099833},{id:"RR",isFront:!1,isLeft:!1,footX:-.324,footZ:.265,hipAxisX:1,pitchAxisY:-.099833}];for(let he of re){let De=z.getObjectByName(`${he.id}_HIP`),$e=z.getObjectByName(`${he.id}_THIGH`),st=z.getObjectByName(`${he.id}_CALF`),pt=z.getObjectByName(`${he.id}_WHEEL`);if(!De||!$e||!st||!pt)continue;let Mt=he.isFront?-.006:.006,Ye=Wf(he.isFront,Mt,-Uc);N.push({id:he.id,isFront:he.isFront,isLeft:he.isLeft,hip:De,thigh:$e,calf:st,wheel:pt,hipRestQ:De.quaternion.clone(),thighRestQ:$e.quaternion.clone(),calfRestQ:st.quaternion.clone(),wheelRestQ:pt.quaternion.clone(),hipAxis:new D(he.hipAxisX,0,0),pitchAxis:new D(0,he.pitchAxisY,.995004).normalize(),footOffsetX:he.footX,footOffsetZ:he.footZ,restX:Mt,restThighAbs:Ye.thighAbs,restCalfRel:Ye.calfRel,wheelAngle:0,currentDeltaY:0,currentDeltaX:0,currentHipRoll:0,lastKneeDelta:0})}},Le=new Ec,Gt=!1,at=0,an=()=>{a||c||!Gt||at>0||(c=!0,fe(),k.render(ee,te),tn(2),e.onReady?.())},cn=()=>{at=Math.max(0,at-1),a||(c?(fe(),k.render(ee,te)):an())};if(!o&&(e.forestKitBase64||e.forestKitUrl)){at+=1;let z=he=>{a||gt().applyPhotorealKit(he.scene),cn()},re=()=>cn();if(e.forestKitBase64)try{let he=qh(e.forestKitBase64);Le.parse(he,"",z,re)}catch{re()}else e.forestKitUrl&&Le.load(e.forestKitUrl,z,void 0,re)}if(!o&&e.forestSkyUrl&&(at+=1,new Ts().load(e.forestSkyUrl,re=>{if(a){re.dispose();return}re.colorSpace=ct,re.mapping=Ls,re.needsUpdate=!0,Ge=re,cn()},void 0,()=>cn())),!o&&(e.forestHdrBase64||e.forestHdrUrl)){at+=1;let z=new Ac,re=he=>{if(a){he.dispose();return}he.mapping=Ls;let De=pe.fromEquirectangular(he);he.dispose(),Ue=De.texture,cn()};if(e.forestHdrBase64)try{let he=qh(e.forestHdrBase64),De=z.parse(he),$e=new $i(De.data,De.width,De.height);$e.type=De.type,$e.minFilter=Nt,$e.magFilter=Nt,$e.generateMipmaps=!1,$e.flipY=!0,$e.needsUpdate=!0,re($e)}catch{cn()}else e.forestHdrUrl&&z.load(e.forestHdrUrl,he=>re(he),void 0,()=>cn())}let Zt=z=>{if(a)return;let re=z.scene,he=Xh[t];re.traverse($e=>{if($e.isMesh){let st=$e;st.castShadow=!o,st.receiveShadow=!o;let pt=Array.isArray(st.material)?st.material:[st.material];for(let Mt of pt)Mt&&"envMapIntensity"in Mt&&(Mt.envMapIntensity=he.envIntensity)}});let De=new rn().setFromObject(re);De.isEmpty()||(re.position.y-=De.min.y),Je(re),tt.add(re),Gt=!0,an()},Un=z=>{if(a)return;let re=z instanceof Error?z.message:String(z??"3D model load failed");e.onError?.(re)};if(e.glbBase64)try{let z=qh(e.glbBase64);Le.parse(z,"",Zt,Un)}catch(z){Un(z)}else e.glbUrl?Le.load(e.glbUrl,Zt,void 0,Un):Un(new Error("No 3D model source provided"));let oe=new Tn,it=(z,re)=>{let he=-p*1.85,De=d*.92,$e=-g*1.95,st=Math.abs(he)>.02||Math.abs(De)>.02||Math.abs($e)>.02;st&&(F=!0);let pt=1-Math.exp(-7.5*z);T=S,S+=(he-S)*pt,x+=(De-x)*pt,P+=($e-P)*pt,Math.abs(S)<.002&&Math.abs(he)<.001&&(S=0),Math.abs(x)<.002&&Math.abs(De)<.001&&(x=0),Math.abs(P)<.002&&Math.abs($e)<.001&&(P=0);let Mt=P*z;v=Yh(v+Mt);let Ye=Math.cos(v),nn=Math.sin(v),kn=Ye,zi=-nn,ii=nn,Pr=Ye,si=_+(kn*S+ii*x)*z,Hi=f+(zi*S+Pr*x)*z,Fc=.44;if(t==="forest"&&ve){let Kt=ve.constrainPosition(_,f,si,Hi,Fc);si=Kt.x,Hi=Kt.z}for(let Kt of A()){let rs=si-Kt.x,Gn=Hi-Kt.z,je=Math.hypot(rs,Gn),Uo=Fc+Kt.r;if(je<Uo&&je>1e-4){let No=(Uo-je)/je;si+=rs*No,Hi+=Gn*No}}let Bc=Math.hypot(si,Hi),eu=b()-Fc;if(Bc>eu&&Bc>1e-4){let Kt=eu/Bc;si*=Kt,Hi*=Kt}let tu=si-_,nu=Hi-f,tp=tu*kn+nu*zi,iu=tu*ii+nu*Pr;_=si,f=Hi;let En={FL:0,FR:0,RL:0,RR:0};for(let Kt of N){let rs=_+kn*Kt.footOffsetX+ii*Kt.footOffsetZ,Gn=f+zi*Kt.footOffsetX+Pr*Kt.footOffsetZ;En[Kt.id]=Ce(rs,Gn)}let np=N.length===4?.25*(En.FL+En.FR+En.RL+En.RR):Ce(_,f),ip=.5*(En.FL+En.FR),sp=.5*(En.RL+En.RR),rp=.5*(En.FL+En.RL),op=.5*(En.FR+En.RR),Oc=1-Math.exp(-12*z);m+=(np-m)*Oc;let ap=Math.atan2(ip-sp,.64)*.72,cp=Math.atan2(rp-op,.53)*.72;M+=(ap-M)*Oc,y+=(cp-y)*Oc;let lp=Wt((S-T)/Math.max(.008,z),-5,5),hp=Wt(lp*.015,-.065,.065),up=Wt(-S*P*.042-x*.055,-.08,.08),su=1-Math.exp(-9*z);w+=(hp-w)*su,R+=(up-R)*su;let zc=Math.hypot(S,x),dp=-Wt(zc*.012,0,.022),fp=o&&zc<=.02?0:Math.sin(re*.0022)*(zc>.08?.004:.0026),ru=u+dp+fp,ou=Math.abs(x)+Math.abs(P)*.14;if(ou>.04&&(I+=z*(6.2+ou*3.8)),le.position.set(_,m,f),le.rotation.y=v,Pe.position.y=.012,Pe.rotation.set(-Math.PI/2+y,M,0),Se.position.y=.018,Se.rotation.set(-Math.PI/2+y,M,0),Se.material.opacity=t==="forest"?st?.44:.26:st?.54:.36,ze&&N.length===4){let Kt=M+w,rs=y+R;ze.position.y=mt+ru,ze.rotation.set(rs,0,Kt);let Gn=Wt(Math.abs(x)/.45,0,1);for(let je of N){let Uo=En[je.id]-m,No=ru+Kt*je.footOffsetX-rs*je.footOffsetZ,pp=je.isFront===je.isLeft?1:-1,Hc=I+(pp>0?0:Math.PI),mp=Gn>.05?Math.max(0,Math.sin(Hc))*.052*Gn:0,gp=Gn>.05?Math.cos(Hc)*.022*Gn:0,_p=Gn>.05?Math.cos(Hc)*.13*Gn*Math.sign(x||1):0,xp=je.restX-w*.18+gp,yp=Wt(Uc+No-Uo-mp,.18,.465),vp=Wt(_p+R*(je.isLeft?.65:-.65),-.28,.28),kc=1-Math.exp(-18*z);je.currentDeltaY+=(Uc-yp-je.currentDeltaY)*kc,je.currentDeltaX+=(xp-je.restX-je.currentDeltaX)*kc,je.currentHipRoll+=(vp-je.currentHipRoll)*kc;let Mp=Wt(Uc-je.currentDeltaY,.18,.465),au=Wf(je.isFront,je.restX+je.currentDeltaX,-Mp),bp=au.thighAbs-je.restThighAbs-Kt,cu=au.calfRel-je.restCalfRel;je.lastKneeDelta=cu,oe.setFromAxisAngle(je.hipAxis,je.currentHipRoll),je.hip.quaternion.copy(je.hipRestQ).premultiply(oe),oe.setFromAxisAngle(je.pitchAxis,bp),je.thigh.quaternion.copy(je.thighRestQ).premultiply(oe),oe.setFromAxisAngle(je.pitchAxis,cu),je.calf.quaternion.copy(je.calfRestQ).premultiply(oe);let Sp=tp+(je.isLeft?-Gf:Gf)*Mt+(Math.abs(iu)>1e-4?iu*.15:0);je.wheelAngle-=Sp/Fy,oe.setFromAxisAngle(je.pitchAxis,je.wheelAngle),je.wheel.quaternion.copy(je.wheelRestQ).premultiply(oe)}}ie.position.set(_,m+.25,f),ne.position.set(_+1.15,m+3.55,f-1.05),t==="forest"&&ve&&(Z.position.set(_,m+.2,f),xe.position.set(_+4.8,m+9.2,f-5.4),ve.update(z,re,_,f))},Xe=z=>{if(a||r){Ut=0;return}if(o&&Hn>0&&z-Hn<Vs){Ut=requestAnimationFrame(Xe);return}let re=Math.min(.05,Math.max(.001,(z-yn)/1e3));yn=z;let he=re*60,De=1-Math.pow(.84,he);u+=(h-u)*De,it(re,z);let $e=m+Et()+u*.4,st=1-Math.exp(-7.5*re);zt.x+=(_-zt.x)*st,zt.y+=($e-zt.y)*st,zt.z+=(f-zt.z)*st,U>0&&(U=Math.max(0,U-re));let pt=Math.abs(S)>.08||Math.abs(P)>.08;if(F&&pt&&!E&&Ht.size===0&&U<=0){let Ye=Yh(-v+Math.PI-.42),nn=Yh(Ye-Ot);Ot+=nn*(1-Math.exp(-2.2*re)),xn+=((t==="forest"?1.36:1.19)-xn)*(1-Math.exp(-1.8*re)),hn+=((t==="forest"?2.65:2.25)-hn)*(1-Math.exp(-1.8*re))}if(!E&&Ht.size===0)if(Math.abs(qt)>8e-5||Math.abs(un)>8e-5){Ot+=qt*he,xn=Wt(xn+un*he,Of,zf);let Ye=Math.pow(.915,he);qt*=Ye,un*=Ye}else qt=0,un=0;if(Ct+=(Ot-Ct)*De,nt+=(xn-nt)*De,Dt+=(hn-Dt)*De,et.opacity=o?.92:.9+Math.sin(z*.0014)*.06,zn(),k.render(ee,te),Hn=z,!o){Ut=requestAnimationFrame(Xe);return}E||Ht.size>0||Math.abs(d)>.001||Math.abs(p)>.001||Math.abs(g)>.001||Math.abs(S)>.004||Math.abs(x)>.004||Math.abs(P)>.004||Math.abs(qt)>1e-4||Math.abs(un)>1e-4||Math.abs(Ot-Ct)>8e-4||Math.abs(xn-nt)>8e-4||Math.abs(hn-Dt)>.002||Math.abs(h-u)>6e-4||Math.abs(w)>.001||Math.abs(R)>.001||Math.abs(_-zt.x)>.002||Math.abs($e-zt.y)>.002||Math.abs(f-zt.z)>.002?Ut=requestAnimationFrame(Xe):gi>0?(gi-=1,Ut=requestAnimationFrame(Xe)):Ut=0};return ti=()=>{!a&&!r&&!Ut&&(Ut=requestAnimationFrame(Xe))},r||ti(),{setScene(z){let re=Vf(z);if(re===t)return;let he=t==="forest";t=re,fe(),he!==(t==="forest")&&(ni(),_i(),zt.set(0,Et()+u*.4,0),l||(Ct=Po,Ot=Po,nt=He(),xn=He(),Dt=me(),hn=me()),zn()),tn(4)},setAccentTone(z){let re=z==="fsdBlue"?"fsdBlue":"graphite";re!==n&&(n=re,fe(),tn(2))},setInteractive(z){i=z,s.style.cursor=z?"grab":"default",z||(Ht.clear(),E=!1,G=null)},setPaused(z){r!==z&&(r=z,r?Ut&&(cancelAnimationFrame(Ut),Ut=0):tn(2))},setBodyHeight(z){$(z),tn(6)},setDriveInput(z,re,he){let De=Number.isFinite(z)?Wt(z,-1,1):0,$e=Number.isFinite(re)?Wt(re,-1,1):0,st=Number.isFinite(he)?Wt(he,-1,1):0;De===d&&$e===p&&st===g||(d=De,p=$e,g=st,tn(6))},resetView:Sn,resetRobot:ni,resize:_i,getState(){let z=N.find(re=>re.id==="FL");return{theta:Ct,phi:nt,radius:Dt,scene:t,accentTone:n,ready:c,userMoved:l,robotX:_,robotY:m,robotZ:f,robotYaw:v,speed:Math.hypot(S,x),wheelSpinFL:z?.wheelAngle??0,kneeDeltaFL:z?.lastKneeDelta??0,articulated16Dof:N.length===4,discoveredBeacons:ve?.getDiscoveredBeacons()??0,totalBeacons:ve?.getTotalBeacons()??0}},dispose(){a||(a=!0,Ut&&cancelAnimationFrame(Ut),s.removeEventListener("pointerdown",q),s.removeEventListener("pointermove",Te),s.removeEventListener("pointerup",Re),s.removeEventListener("pointercancel",Re),s.removeEventListener("wheel",Ve),typeof window<"u"&&window.removeEventListener("resize",dt),ve?.dispose(),de&&de!==Ge&&de.dispose(),Ge&&Ge.dispose(),j&&j.dispose(),se&&se.dispose(),Ee.dispose(),Oe.dispose(),Ie.dispose(),Ue&&Ue.dispose(),pe.dispose(),ue.dispose(),Ae.dispose(),Be.dispose(),qe.dispose(),Ne.dispose(),et.dispose(),k.dispose())}}}function Do(s){try{window.ReactNativeWebView?.postMessage(JSON.stringify(s))}catch{}}function Vy(){let e=typeof navigator<"u"&&/Android/i.test(navigator.userAgent||"")?"low":"high";try{let t=new URLSearchParams(window.location.search||""),n=t.get("scene"),i=n==="charcoal"||n==="gallery"||n==="hangar"||n==="forest"?n:"forest",r=t.get("accent")==="fsdBlue"?"fsdBlue":"graphite",o=t.get("interactive")!=="0",a=t.get("paused")==="1",c=t.get("perf"),l=c==="low"?"low":c==="high"?"high":e,h=t.get("height"),u=h!==null?Number(h):NaN;return{scene:i,accentTone:r,interactive:o,paused:a,performanceTier:l,bodyHeightM:Number.isFinite(u)?u:null}}catch{return{scene:"forest",accentTone:"graphite",interactive:!0,paused:!1,performanceTier:e,bodyHeightM:null}}}function ep(){let s=document.getElementById("stage");if(!s){Do({type:"error",message:"Missing canvas element"});return}let e=Vy(),t=e.performanceTier==="high";try{let n=Qf(s,{glbBase64:window.__DOSO_STANDBY_GLB_B64__,glbUrl:window.__DOSO_STANDBY_GLB_B64__?void 0:"./thunder-r50-standby.glb",forestKitBase64:t?window.__DOSO_FOREST_KIT_B64__:void 0,forestSkyUrl:t?window.__DOSO_FOREST_SKY_URI__:void 0,forestHdrBase64:t?window.__DOSO_FOREST_HDR_B64__:void 0,scene:e.scene,accentTone:e.accentTone,interactive:e.interactive,paused:e.paused,performanceTier:e.performanceTier,bodyHeightM:e.bodyHeightM,onReady:()=>Do({type:"ready"}),onError:i=>Do({type:"error",message:i}),onUserMovedChange:i=>Do({type:"userMoved",moved:i})});window.__dosoStandby3d=n,delete window.__DOSO_STANDBY_GLB_B64__,delete window.__DOSO_FOREST_KIT_B64__,delete window.__DOSO_FOREST_SKY_URI__,delete window.__DOSO_FOREST_HDR_B64__}catch(n){Do({type:"error",message:n instanceof Error?n.message:String(n??"3D init failed")})}}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",ep,{once:!0}):ep();})();
