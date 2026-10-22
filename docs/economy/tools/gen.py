from decimal import Decimal as D, getcontext, ROUND_FLOOR, ROUND_CEILING
import json, math
getcontext().prec=40
C=dict(v0="10",rho="1.5",eta="1.2544",d0="1.5",dFirst=["1.12",18],gD="1.243",P0="1",gP="1.2544",H0="100",gH="1.12",
 E0="150",eG="1.10",C0="10",cG="1.10",s0="6",gS="1.050",
 coreMult="4",coreFrac="0.4",travelK="0.12",chargeK="0.002",repairK="0.5",feeFrac="0.05",feeFloorK="3",feeCapK="30",
 c0=24,base=dict(drill_power="1",drill_tip="83",hull="46"),r="1.225",drillRow=dict(first="1",base="20",ratio="1.48"),rTip="1.500625",w=dict(drill_power=2,drill_tip=3,engine=1.5,boiler=1,cargo_hold=1,hull=2),
 purchaseRow=dict(cargo_hold=["2.4","1.15"],boiler=["2.4","1.20"],engine=["3.6","1.60"]),
 Hk="7",Dkc="17.5",Dkb="16.5",gE="1.12",ET0=1,etPlanet=6,etBand=1,KxE=60,tkill="1.5",
 paceFrom=[[2,"1.2"],[3,"1.2"],[4,"1.3"],[6,"1.6"],[8,"1.7"]],paceBy={"5":"1.44"})
d=lambda s:D(str(s))
def tier(p,b): return 3*(p-1)+b
def V(t): return d(C['v0'])*d(C['rho'])**(t-1)
def Hh(t): return d(C['eta'])**(t-1)
# drill power per purchase (GD ruling on #551, ticket 552): D(0) = 1.5, D(n) = 1.5 x 1.12^(1/18) x 1.243^(n-1).
def Dr(n): return d(C['d0']) if n==0 else d(C['d0'])*d(C['dFirst'][0])**(d(1)/C['dFirst'][1])*d(C['gD'])**(n-1)
def Pt(L): return d(C['P0'])*d(C['gP'])**L
def Hu(L): return d(C['H0'])*d(C['gH'])**L
# The planet registry rows' frozen radii (ores.economy.json planets.rows, tickets 642, 643), #6's ladder past the last row.
_rows=json.load(open(__import__('os').path.join(__import__('os').path.dirname(__file__),'../../../src/features/ores/ores.economy.json')))['ore']['planets']['rows']
def R(p): return _rows[p-1]['radius']['tiles'] if p<=len(_rows) else 300+(700*(p-1))//((p-1)+6)
def coreR(Rr): return min(10,max(4,Rr//40))
def coreTiles(Rr):
    c=coreR(Rr); return sum(1 for x in range(-c,c+1) for y in range(-c,c+1) if (2*x+1)**2+(2*y+1)**2<=(2*c)**2)
def need(Rr): return -(-4*coreTiles(Rr)//10)
def Lon(tr,p):
    return dict(drill_power=3*(p-1)+12,drill_tip=3*(p-1)+7,hull=6*(p-1)+2,cargo_hold=min(2*(p-1)+22,34),boiler=min((p-1)+4,16),engine=min(3*(p-1)+2,131))[tr]
# paceScale(p) (#131 fromPlanet): the planet's own byPlanet row (P5 1.44, provisional until #644),
# else the last row at or below p, else 1; it multiplies every price.
def pace(p): return d(C['paceBy'].get(str(p)) or ([s for f_,s in C['paceFrom'] if f_<=p] or ["1"])[-1])
# drill power's price rows per purchase (#551, ticket 552): price(0) = 1, price(n) = ceil(20 x 1.48^(n-1)), times pace(p).
def drillRow(n):
    R_=C['drillRow']; return d(R_['first']) if n==0 else (d(R_['base'])*d(R_['ratio'])**(n-1)).to_integral_value(rounding=ROUND_CEILING)
# the hold's, the boiler's and the engine's rows per purchase (ticket 553, Systems' rows on #553): ceil(base x ratio^n), times pace(p).
def purchaseRow(tr,n):
    b,r_=C['purchaseRow'][tr]; return (d(b)*d(r_)**n).to_integral_value(rounding=ROUND_CEILING)
def cost(tr,L,p=1):
    if tr=='drill_power': return drillRow(L)*pace(p)
    if tr in C['purchaseRow']: return purchaseRow(tr,L)*pace(p)
    base=d(C['base'][tr]) if tr in C['base'] else d(C['c0'])*d(C['w'][tr]); r=d(C[dict(drill_tip='rTip').get(tr,'r')])
    return (base*r**L*pace(p)).to_integral_value(rounding=ROUND_CEILING)
# the hold and the tank: round(start x 1.10^n), ties to even; the engine: 6 x 1.05^e m/s (ticket 553).
def cargo(n): return int((d(C['C0'])*d(C['cG'])**n).to_integral_value())
def energy(n): return int((d(C['E0'])*d(C['eG'])**n).to_integral_value())
def speed(e): return d(C['s0'])*d(C['gS'])**e
def ET(p,b): return C['ET0']+C['etPlanet']*(p-1)+C['etBand']*(b-1)
def eh(T): return d(C['Hk'])*d(C['gE'])**T
def ed(T,k='c'): return d(C['Dkc'] if k=='c' else C['Dkb'])*d(C['gE'])**T
def sat(mn,mx,T): return d(mn)+(d(mx)-d(mn))*T/(T+C['KxE'])
def f(x,sig=3):
    x=d(x)
    if x==0: return "0"
    if abs(x)<10**6 and abs(x)>=1000: return f"{int(x):,}"
    if abs(x)<10**6: return f"{float(x):.{sig}g}"
    e=x.adjusted(); m=x.scaleb(-e); return f"{float(m):.2f}e{e}"
P=range(1,41)
A=["| p | R | core r | core tiles | core needed | ore V surface | ore V band 5 | core V | hardness band 5 | core hardness |","|--|--|--|--|--|--|--|--|--|--|"]
B=["| p | drill L | drill power | tip L | hull L | hull max | cargo L | cargo | boiler L | energy max | engine L | speed m/s |","|--|--|--|--|--|--|--|--|--|--|--|--|"]
Cc=["| p | drill_power next | drill_tip next | hull next | charge/energy | full repair | rescue floor | rescue cap | travel fee |","|--|--|--|--|--|--|--|--|--|"]
En=["| p | crawler T (b1..b5) | crawler health b3 | crawler hit b3 | kill s b1/b3/b5 | side hit % b1/b3/b5 | -1 planet: kill s / side % (b3) |","|--|--|--|--|--|--|--|"]
rows=[]; prev=None
for p in P:
    Rr=R(p); ct=coreTiles(Rr); t5=tier(p,5)
    A.append(f"| {p} | {Rr} | {coreR(Rr)} | {ct} | {need(Rr)} | {f(V(tier(p,1)))} | {f(V(t5))} | {f(V(tier(p,6)))} | {f(Hh(t5))} | {f(d(C['coreMult'])*Hh(t5))} |")
    Ld,Lt,Lh,Lc,Lb,Le=[Lon(k,p) for k in ('drill_power','drill_tip','hull','cargo_hold','boiler','engine')]
    B.append(f"| {p} | {Ld} | {f(Dr(Ld))} | {Lt} | {Lh} | {f(Hu(Lh))} | {Lc} | {cargo(Lc)} | {Lb} | {energy(Lb)} | {Le} | {float(speed(Le)):.1f} |")
    V3=V(tier(p,3))*pace(p)
    fl=d(C['feeFloorK'])*V3; cp=d(C['feeCapK'])*V3
    Cc.append(f"| {p} | {f(cost('drill_power',Ld,p))} | {f(cost('drill_tip',Lt,p))} | {f(cost('hull',Lh,p))} | {f(d(C['chargeK'])*V3,2)} | {f(d(C['repairK'])*V3)} | {f(fl)} | {f(cp)} | {f(d('0.12')*10*V(t5)*pace(p))} |")
    ks=[];ss=[]
    for b in (1,3,5):
        T=ET(p,b); ks.append(eh(T)/Dr(Ld)); ss.append(ed(T)/Hu(Lh)*100)
    ks1=eh(ET(p,3))/Dr(Lon('drill_power',p-1)) if p>1 else None
    ss1=ed(ET(p,3))/Hu(Lh-6)*100 if p>1 else None
    En.append(f"| {p} | {ET(p,1)}..{ET(p,5)} | {f(eh(ET(p,3)))} | {f(ed(ET(p,3)))} | {float(ks[0]):.2f} / {float(ks[1]):.2f} / {float(ks[2]):.2f} | {float(ss[0]):.1f} / {float(ss[1]):.1f} / {float(ss[2]):.1f} | "+(f"{float(ks1):.2f} / {float(ss1):.0f}%" if ks1 else "n/a")+" |")
    rows.append(dict(p=p,kill=ks,side=ss))
    # asserts; the pinned kill window of 1.0 to 2.0 s (#20 acceptance 4) waits on the combat damage
    # design of #555: drill damage still follows the per-purchase drill power of #552.
    assert 15<=float(ss[0]) and float(ss[2])<=25.01,(p,ss)
    if prev: assert R(p)>=R(p-1) and V(t5)>V(prev) and Dr(Ld)>prev_d
    prev=tier(p,5); prev_d=Dr(Ld)
assert R(10**9)<=1000 and coreTiles(1000)<=316
# arrival rule: surface ore tier of p equals band 4 of p-1
for p in range(2,41): assert tier(p,1)==tier(p-1,4)
# rescue 25% tank covers round trip to first ore at level 0 on planet 1
Rr=R(1); first=int(0.08*(Rr-coreR(Rr))); dig=first/(1.5/1.0); climb=first/6.0
e_need=dig*1.0+climb*1.5
print("first-ore band depth",first,"energy needed",round(e_need,1),"25% tank",0.25*energy(0))
assert e_need<0.25*energy(0)
open('out/planet-table.md','w').write("\n".join(A)); open('out/vehicle-table.md','w').write("\n".join(B))
open('out/price-table.md','w').write("\n".join(Cc)); open('out/enemy-table.md','w').write("\n".join(En))
# ratio checks
print("cost ratio/planet", float(d(C['r'])**6), "drill cost ratio/planet", float(d(C['drillRow']['ratio'])**3), "value ratio/planet", float(d(C['rho'])**3), "hardness", float(d(C['eta'])**3), "drill", float(d(C['gD'])**3))
print("level-0 prices", {k:int(cost(k,0)) for k in C['w']})
print("p40 R",R(40),"coreTiles",coreTiles(R(40)), "p1",R(1),coreR(R(1)),coreTiles(R(1)),"p2",R(2),coreR(R(2)),coreTiles(R(2)))
json.dump(C,open('out/economy-constants.json','w'),indent=1)
