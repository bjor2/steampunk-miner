#!/usr/bin/env python3
"""Macro economy simulator for steampunk-miner ticket #6 (planning aid, not game code).
A greedy 'competent player' bot plays trips (undock -> dig -> return -> sell -> buy) and the
script reports pacing per planet. All parameters live in P so the same numbers go into the data table."""
import math, sys, json
from fractions import Fraction

P = dict(
  v0=10.0, rho=1.5,            # ore tier value: V(t)=v0*rho^(t-1)
  h0=1.0, eta=1.25,            # hardness: H(t)=h0*eta^(t-1)
  d0=1.5, e=1.12,              # drill power D(L)=d0*e^L (hardness-units per second)
  c0=40.0, r=1.22,             # upgrade cost: c0*w_i*r^L
  vcap=2.5,                    # max drilling speed tiles/s
  band_edges=[0.0,0.08,0.35,0.65,0.90,1.0],   # fraction of depth to centre
  dens=[0.10,0.14,0.18,0.20,0.22],            # ore tiles per drilled tile in each band
  core_mult=1.5,               # core tile hardness vs band-5 tier
  lateral=1.0,                 # extra tiles drilled per ore tile (already in dens)
  e_drill=1.0, e_move=0.25,    # energy per second drilling / moving
  cargo0=10, energy0=150, move0=3.0, move_max=12.0, move_k=25.0,
  travel_k=18.0,               # travel cost = travel_k * V(tier(p,4)) * cargo-ish ... see below
  core_frac=0.25,              # fraction of core tiles needed for travel
  R0=300, R_inf_gain=1700, R_k=16,
  recharge_price=0.02, # money per energy unit as fraction of V(tier at band) -> sink, applied per trip
  repair_frac=0.0,
)
W = dict(drill=1.0, cargo=0.8, energy=0.8, speed=1.0, hull=2.0)  # track cost weights

def radius(p): return P['R0'] + (P['R_inf_gain']*(p-1))//((p-1)+P['R_k'])
def core_r(R): return min(10, max(4, R//40))
def core_tiles(R):
    c=core_r(R); return sum(1 for x in range(-c,c+1) for y in range(-c,c+1) if (2*x+1)**2+(2*y+1)**2<=(2*c)**2) if R<=2048 else 0
def tier(p,b): return 3*(p-1)+b           # b = 1..5 ; core material tier = 3(p-1)+6
def V(t): return P['v0']*P['rho']**(t-1)
def H(t): return P['h0']*P['eta']**(t-1)
def D(L): return P['d0']*P['e']**L
def cost(track,L):
    if track=='tip': return P['c0']*3.0*P['r']**(2*L)
    return P['c0']*W[track]*P['r']**L
def cargo(L): return P['cargo0']+3*L+L*L//50
def energy(L): return P['energy0']+10*L+L*L//30
def move(L): return P['move0']+(P['move_max']-P['move0'])*L/(L+P['move_k'])
def travel_cost(p): return P['travel_k']*V(tier(p,5))*P['cargo0']   # ~ price of travel_k full starter cargos at deep tier

def band_tiles(R):
    cr=core_r(R); depth=R-cr
    ed=[int(round(f*depth)) for f in P['band_edges']]
    return [ed[i+1]-ed[i] for i in range(5)], depth

def best_trip(p, lv, core_needed, shaft):
    """Best single trip given persistent shaft depth (tiles). Returns (score,time,money,coreUnits,band,newShaft)."""
    R=radius(p); bt,depth=band_tiles(R)
    edges=[0]
    for x in bt: edges.append(edges[-1]+x)
    Dp=D(lv['drill']); C=cargo(lv['cargo']); E=energy(lv['energy'])*0.9; v=move(lv['speed'])
    best=None
    for target in range(1,6):
        goal=(edges[target-1]+edges[target])//2 if target<5 else (edges[5] if core_needed>0 else edges[4]+(bt[4]*3)//4)
        tt=0.0; en=0.0; units=0.0; val=0.0
        use=min(shaft,goal)
        tt+=2*use/v; en+=2*use/v*P['e_move']
        ns=shaft; ok=True
        if shaft<goal:                         # extend the shaft, digging yields ore
            pos=shaft
            while pos<goal and ok:
                b=max(i for i in range(5) if edges[i]<=pos)+1
                step=min(goal,edges[b])-pos
                hb=H(tier(p,b)); sp=min(P['vcap'],Dp/hb)
                if sp<=0.05: ok=False; break
                t=step/sp
                if en+t*P['e_drill']+ (goal/v)*P['e_move']*2>E: 
                    # partial extension limited by energy
                    t=max(0,(E-en-(pos/v)*P['e_move']*2)/P['e_drill']); step=t*sp
                    if step<1: ok=False; break
                    tt+=t; en+=t*P['e_drill']; u=step*P['dens'][b-1]; units+=u; val+=u*V(tier(p,b)); pos+=step; break
                tt+=t; en+=t*P['e_drill']; u=step*P['dens'][b-1]; units+=u; val+=u*V(tier(p,b)); pos+=step
            ns=pos
            if not ok: continue
            tt+=pos/v*0   # descent along the new shaft is the dig itself; climb back below
            tt+=pos/v; en+=pos/v*P['e_move']
        if units>C:
            f=C/units; units=C; val*=f
        hb=H(tier(p,target)); sp=min(P['vcap'],Dp/hb); dens=P['dens'][target-1]
        core_trip=(target==5 and core_needed>0 and ns>=edges[5]-1)
        if ns>=edges[target-1] and units<C and sp>0.05 and not core_trip:
            room=C-units; tiles_needed=room/dens
            tiles_possible=max(0,(E-en)/P['e_drill'])*sp
            tiles=min(tiles_needed,tiles_possible); t=tiles/sp
            tt+=t; en+=t*P['e_drill']; got=tiles*dens; units+=got; val+=got*V(tier(p,target))
        coreu=0
        if core_trip:
            hc=H(tier(p,5)+1)*P['core_mult']; spc=min(P['vcap'],Dp/hc)
            if spc>0.05:
                tiles=min(C-units, max(0,(E-en)/P['e_drill'])*spc, core_needed)
                if tiles>=1: coreu=tiles; tt+=tiles/spc; en+=tiles/spc*P['e_drill']
        tt+=8.0
        rate=val/tt
        score=(1e60+coreu) if (coreu>0) else rate
        cand=(score,tt,val,coreu,target,ns)
        if best is None or cand[0]>best[0]: best=cand
    return best

def simulate(planets=3, verbose=False, max_hours=400):
    lv=dict(drill=0,cargo=0,energy=0,speed=0); mand=dict(tip=0,hull=0)
    money=0.0; clock=0.0; log=[]; first_up=None
    for p in range(1,planets+1):
        R=radius(p); nct=core_tiles(R); need=math.ceil(P['core_frac']*nct); bay=0
        start=clock; trips=0; core_t=None; income_total=0.0; spent=0.0; shaft=0; docks=0
        while True:
            trip=best_trip(p,lv,need-bay,shaft)
            if trip is None:
                clock+=120
                if clock-start>3600*max_hours: break
                continue
            _,tt,val,coreu,tg,ns=trip
            clock+=tt; money+=val; income_total+=val; trips+=1; shaft=max(shaft,int(ns))
            money-=P['recharge_price']*V(tier(p,max(1,tg)))*energy(lv['energy'])/10
            bay+=coreu
            if bay>=need and core_t is None: core_t=clock-start
            while True:
                mt=3*(p-1)+7; mh=6*(p-1)+2
                if mand['tip']<mt and cost('tip',mand['tip'])<=money: money-=cost('tip',mand['tip']); spent+=cost('tip',mand['tip']); mand['tip']+=1; continue
                if mand['hull']<mh and cost('hull',mand['hull'])<=money: money-=cost('hull',mand['hull']); spent+=cost('hull',mand['hull']); mand['hull']+=1; continue
                base=best_trip(p,lv,need-bay,shaft)
                if base is None: break
                brate=base[2]/base[1]
                bt_,dp_=band_tiles(R)
                if need-bay>0 and shaft>=dp_-2 and D(lv['drill'])/(H(tier(p,5)+1)*P['core_mult'])<0.4:
                    c=cost('drill',lv['drill'])
                    if c<=money: money-=c; spent+=c; lv['drill']+=1; continue
                    break
                opts=[]
                for tr in lv:
                    l2=dict(lv); l2[tr]+=1
                    nt=best_trip(p,l2,need-bay,shaft)
                    c=cost(tr,lv[tr])
                    if nt is None or c>money: continue
                    nrate=nt[2]/nt[1]
                    gain=(nrate-brate) if base[3]==0 else (nt[3]-base[3]) + 1e-6*(nrate-brate)
                    if base[3]==0 and nt[3]>0: gain=1e60
                    if gain>0: opts.append((gain/c,tr,c))
                if not opts:
                    if need-bay>0 and base[3]==0:
                        tr=min(('drill','energy'),key=lambda t:cost(t,lv[t])); c=cost(tr,lv[tr])
                        if c<=money: money-=c; spent+=c; lv[tr]+=1; continue
                    break
                opts.sort(reverse=True); _,tr,c=opts[0]
                money-=c; spent+=c; lv[tr]+=1
                if first_up is None: first_up=clock
            if core_t is not None:
                tc=travel_cost(p)
                if money>=tc:
                    money-=tc; break
            if clock-start>3600*max_hours: break
        log.append(dict(planet=p,R=R,core_tiles=nct,need=need,core_min=(core_t or 0)/60,planet_min=(clock-start)/60,trips=trips,
                 levels=dict(lv,**mand),income=income_total,spent=spent,money_left=money))
    return log, first_up

if __name__=='__main__':
    n=int(sys.argv[1]) if len(sys.argv)>1 else 3
    log,fu=simulate(n)
    print('first upgrade at %.1f s'%fu if fu else 'no upgrade')
    for r in log:
        print("p%-2d R=%-5d coreTiles=%-4d core@%5.1f min  planetTotal %5.1f min trips=%-3d lv=%s income=%.3g"%(r['planet'],r['R'],r['core_tiles'],r['core_min'],r['planet_min'],r['trips'],r['levels'],r['income']))
