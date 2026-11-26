import { useEffect, useMemo, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Activity, ArrowDownToLine, ArrowUpFromLine, Bell, CarFront, CheckCircle2, ChevronRight, ClipboardList, Fuel, Gauge, LayoutDashboard, LogOut, Menu, Plus, Search, Settings, ShieldCheck, Truck, Users, Wrench, X, Pencil, Trash2 } from 'lucide-react';
import { fmtKm, fmtMoney, isConfigured, supabase, type Profile, type Vehicle } from './lib';

type Tab = 'dashboard'|'vehicles'|'drivers'|'trips'|'maintenance'|'fuel';
type Trip = {
  id: string;
  vehicle_id: string;
  driver_id: string;
  start_km: number;
  end_km: number | null;
  started_at: string;
  ended_at: string | null;
  start_photo_path: string | null;
  end_photo_path: string | null;
  vehicle?: Vehicle;
  driver?: Profile;
};
const labels:Record<Tab,string>={dashboard:'Visão geral',vehicles:'Veículos',drivers:'Motoristas',trips:'Retiradas e devoluções',maintenance:'Manutenções',fuel:'Abastecimentos'};
const statusLabel:Record<string,string>={available:'Disponível',in_use:'Em uso',maintenance:'Em manutenção',inactive:'Inativo'};

export default function App(){
 const [session,setSession]=useState<any>(null); const [profile,setProfile]=useState<Profile|null>(null); const [tab,setTab]=useState<Tab>('dashboard'); const [vehicles,setVehicles]=useState<Vehicle[]>([]); const [drivers,setDrivers]=useState<Profile[]>([]); const [trips,setTrips]=useState<Trip[]>([]); const [loading,setLoading]=useState(true); const [notice,setNotice]=useState(''); const [modal,setModal]=useState<'vehicle'|'vehicle-edit'|'driver'|'checkout'|'checkin'|null>(null); const [selected,setSelected]=useState<Vehicle|null>(null); const [editingVehicle,setEditingVehicle]=useState<Vehicle|null>(null); const [query,setQuery]=useState(''); const [mobileMenu,setMobileMenu]=useState(false);
 const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [loginError,setLoginError]=useState('');
 async function load(){ if(!supabase||!session)return; setLoading(true); const [v,d,t]=await Promise.all([supabase.from('vehicles').select('*').order('plate'),supabase.from('profiles').select('*').order('full_name'),supabase.from('trips').select('*').order('started_at',{ascending:false}).limit(100)]); if(v.data)setVehicles(v.data as Vehicle[]); if(d.data)setDrivers(d.data as Profile[]); if(t.data)setTrips(t.data as Trip[]); setLoading(false); }
 useEffect(()=>{ if(!supabase){setLoading(false);return;} supabase.auth.getSession().then(({data})=>setSession(data.session)); const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s)); return()=>subscription.unsubscribe(); },[]);
 useEffect(()=>{
 if(!session||!supabase)return;

 let cancelled = false;

 (async()=>{
   setLoading(true);

   const {data,error} = await supabase
     .from('profiles')
     .select('id, full_name, role, active')
     .eq('id',session.user.id)
     .maybeSingle();

   if(cancelled)return;

   if(error){
     console.error('Erro ao carregar perfil:',error);
     setNotice('Erro ao consultar perfil: '+error.message);
     setProfile(null);
   }else if(!data){
     console.error('Perfil não encontrado para:',session.user.id);
     setNotice('Perfil não encontrado para este usuário.');
     setProfile(null);
     }else{
        setProfile(data as Profile);
        setNotice('');
     }
   setLoading(false);
 })();

 return()=>{cancelled=true;};
},[session]);
 useEffect(()=>{load();},[session]);
 async function signIn(e:FormEvent){e.preventDefault();setLoginError(''); if(!supabase)return;const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setLoginError(error.message);}
 async function signOut(){await supabase?.auth.signOut();setProfile(null);setSession(null);}
 async function saveVehicle(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!supabase||!isAdmin)return;
  const f=new FormData(e.currentTarget);
  const values={plate:String(f.get('plate')).toUpperCase().trim(),brand:String(f.get('brand')).trim(),model:String(f.get('model')).trim(),year:Number(f.get('year'))||null,current_km:Number(f.get('km'))};
  const result=modal==='vehicle-edit'&&editingVehicle
    ? await supabase.from('vehicles').update(values).eq('id',editingVehicle.id)
    : await supabase.from('vehicles').insert({...values,status:'available'});
  if(result.error){setNotice('Não foi possível salvar o veículo: '+result.error.message);return;}
  setModal(null);setEditingVehicle(null);setNotice(modal==='vehicle-edit'?'Veículo atualizado.':'Veículo cadastrado.');await load();
}
async function deleteVehicle(vehicle:Vehicle){
  if(!supabase||!isAdmin)return;
  if(vehicle.status==='in_use'){setNotice('Não é possível remover um veículo que está em utilização.');return;}
  if(!window.confirm(`Confirma a exclusão do veículo ${vehicle.plate}?`))return;
  const {error}=await supabase.from('vehicles').delete().eq('id',vehicle.id);
  if(error){setNotice('Não foi possível remover. Verifique se existem movimentações, manutenções ou abastecimentos vinculados a este veículo. Detalhe: '+error.message);return;}
  setNotice('Veículo removido.');await load();
}
async function deleteTrip(trip:Trip){
  if(!supabase||!isAdmin)return;
  if(!trip.ended_at){setNotice('Não é permitido excluir uma movimentação que ainda está em andamento.');return;}
  if(!window.confirm('Confirma excluir esta movimentação do histórico? Esta ação não pode ser desfeita.'))return;
  const {error}=await supabase.from('trips').delete().eq('id',trip.id);
  if(error){setNotice('Não foi possível excluir a movimentação: '+error.message);return;}
  const paths=[trip.start_photo_path,trip.end_photo_path].filter((x):x is string=>!!x);
  if(paths.length){const {error:photoError}=await supabase.storage.from('trip-odometer-photos').remove(paths);if(photoError)setNotice('Movimentação excluída, mas não foi possível apagar uma ou mais fotos: '+photoError.message);else setNotice('Movimentação e fotos excluídas do histórico.');}
  else setNotice('Movimentação excluída do histórico.');
  await load();
}
async function saveDriver(e:FormEvent<HTMLFormElement>){
  e.preventDefault();
  if(!supabase)return;

  const f=new FormData(e.currentTarget);

  const {error}=await supabase.functions.invoke('admin-create-user',{
    body:{
      email:f.get('email'),
      password:f.get('password'),
      full_name:f.get('name'),
      role:'driver'
    }
  });

  if(error){
    console.error('Erro no cadastro do motorista:',error);

    let detail=error.message;

    const context=(error as any).context;

    if(context instanceof Response){
      try{
        const body=await context.clone().json();
        detail=body.error || JSON.stringify(body);
      }catch{
        detail=error.message;
      }
    }

    setNotice('Falha no cadastro: '+detail);
    return;
  }

  setModal(null);
  setNotice('Motorista cadastrado e autorizado.');
  load();
}
 async function checkout(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  if (!supabase || !selected || !profile) return;

  const f = new FormData(e.currentTarget);
  const km = Number(f.get('km'));
  const photo = f.get('photo') as File;

  if (!photo || !photo.type.startsWith('image/')) {
    setNotice('A foto do painel é obrigatória.');
    return;
  }

  if (km < selected.current_km) {
    setNotice('O KM de retirada não pode ser menor que o KM atual.');
    return;
  }

  const path = `${profile.id}/${crypto.randomUUID()}-retirada.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('trip-odometer-photos')
    .upload(path, photo, { contentType: photo.type });

  if (uploadError) {
    setNotice('Erro ao enviar a foto: ' + uploadError.message);
    return;
  }

  const { error } = await supabase.rpc('checkout_vehicle', {
    p_vehicle_id: selected.id,
    p_start_km: km,
    p_notes: String(f.get('notes') || ''),
    p_start_photo_path: path
  });

  if (error) {
    await supabase.storage.from('trip-odometer-photos').remove([path]);
    setNotice(error.message);
    return;
  }

  setModal(null);
  setNotice('Retirada registrada com foto. Boa viagem!');
  load();
}

async function checkin(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  if (!supabase || !selected || !profile) return;

  const f = new FormData(e.currentTarget);
  const km = Number(f.get('km'));
  const photo = f.get('photo') as File;
  const activeTrip = activeTrips.find(t => t.vehicle_id === selected.id);

  if (!photo || !photo.type.startsWith('image/')) {
    setNotice('A foto do painel na devolução é obrigatória.');
    return;
  }

  if (activeTrip && km < activeTrip.start_km) {
    setNotice('O KM de devolução não pode ser menor que o KM de retirada.');
    return;
  }

  const path = `${profile.id}/${crypto.randomUUID()}-devolucao.jpg`;

  const { error: uploadError } = await supabase.storage
    .from('trip-odometer-photos')
    .upload(path, photo, { contentType: photo.type });

  if (uploadError) {
    setNotice('Erro ao enviar a foto: ' + uploadError.message);
    return;
  }

  const { error } = await supabase.rpc('checkin_vehicle', {
    p_vehicle_id: selected.id,
    p_end_km: km,
    p_notes: String(f.get('notes') || ''),
    p_end_photo_path: path
  });

  if (error) {
    await supabase.storage.from('trip-odometer-photos').remove([path]);
    setNotice(error.message);
    return;
  }

  setModal(null);
  setNotice('Devolução registrada com foto!');
  load();
}
 const filtered=useMemo(()=>vehicles.filter(v=>(v.plate+' '+v.brand+' '+v.model).toLowerCase().includes(query.toLowerCase())),[vehicles,query]);
 const activeTrips=trips.filter(t=>!t.ended_at); const isAdmin=profile?.role==='admin'; const canDrive=profile?.role==='admin'||profile?.role==='driver';
 const handleVehicleAction=(v:Vehicle)=>{ if(v.status==='in_use'){const trip=activeTrips.find(t=>t.vehicle_id===v.id);if(!trip||trip.driver_id!==profile?.id){setNotice('Somente o motorista que retirou este veículo pode devolvê-lo.');return;}} setSelected(v);setModal(v.status==='in_use'?'checkin':'checkout'); };
 if(!isConfigured)return <SetupScreen/>;
 if(!session)return <div className="login-wrap"><div className="login-card"><img src="/logo-vm.png" className="login-logo"/><div className="eyebrow">GESTÃO INTELIGENTE DE VEÍCULOS</div><h1>VM <span>FROTAS</span></h1><p>Acesse sua conta para continuar</p><form onSubmit={signIn} className="stack"><label>E-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com"/></label><label>Senha<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Sua senha"/></label>{loginError&&<div className="error">{loginError}</div>}<button className="primary full">Entrar no sistema</button></form><small>VM Andaimes · Controle de Frota</small></div></div>;
 if(!profile)return <div className="center-screen">{loading?'Carregando seu perfil...':notice||'Seu usuário ainda não possui perfil ativo. Solicite liberação ao administrador.'}</div>;
 if(!profile.active)return <div className="center-screen">Acesso bloqueado. Procure o administrador da frota.</div>;
 return <div className="app-shell"><aside className={mobileMenu?'sidebar open':'sidebar'}><div className="brand"><img src="/logo-vm.png"/><div><b>VM FROTAS</b><small>GESTÃO DE VEÍCULOS</small></div><button className="icon-btn mobile-close" onClick={()=>setMobileMenu(false)}><X/></button></div><div className="nav-caption">MENU PRINCIPAL</div><nav>{(Object.keys(labels) as Tab[]).filter(k=>k!=='drivers'||isAdmin).map(k=><button key={k} className={tab===k?'nav-item active':'nav-item'} onClick={()=>{setTab(k);setMobileMenu(false)}}>{k==='dashboard'?<LayoutDashboard/>:k==='vehicles'?<Truck/>:k==='drivers'?<Users/>:k==='trips'?<ClipboardList/>:k==='maintenance'?<Wrench/>:<Fuel/>}{labels[k]}<ChevronRight className="nav-arrow"/></button>)}</nav><div className="sidebar-bottom"><div className="user-mini"><div className="avatar">{profile.full_name?.slice(0,1)||'U'}</div><div><b>{profile.full_name}</b><small>{profile.role==='admin'?'Administrador':profile.role==='driver'?'Motorista':'Consulta'}</small></div></div><button className="nav-item" onClick={signOut}><LogOut/> Sair</button></div></aside><main className="main"><header className="topbar"><button className="icon-btn menu-toggle" onClick={()=>setMobileMenu(true)}><Menu/></button><div><div className="eyebrow">VM ANDAIMES / FROTAS</div><h2>{labels[tab]}</h2></div><div className="top-actions"><span className="online"><i/> Sistema online</span><button className="icon-btn" title="Notificações"><Bell/></button><div className="avatar">{profile.full_name?.slice(0,1)||'U'}</div></div></header>
 {notice&&<div className="notice"><span>{notice}</span><button onClick={()=>setNotice('')}><X size={16}/></button></div>}
 {tab==='dashboard'&&<><section className="welcome"><div><div className="eyebrow">PAINEL DE CONTROLE</div><h1>Olá, {profile.full_name?.split(' ')[0]} 👋</h1><p>Acompanhe a operação da frota em tempo real.</p></div><div className="welcome-mark"><Gauge size={42}/></div></section><section className="stats"><Stat icon={<Truck/>} label="Total de veículos" value={vehicles.length} tone="orange"/><Stat icon={<CheckCircle2/>} label="Disponíveis" value={vehicles.filter(v=>v.status==='available').length} tone="green"/><Stat icon={<Activity/>} label="Em utilização" value={activeTrips.length} tone="blue"/><Stat icon={<Wrench/>} label="Em manutenção" value={vehicles.filter(v=>v.status==='maintenance').length} tone="purple"/></section><div className="content-grid"><section className="panel"><div className="panel-head"><div><h3>Veículos da frota</h3><p>Status atual dos veículos</p></div><button className="text-btn" onClick={()=>setTab('vehicles')}>Ver todos <ChevronRight size={16}/></button></div><VehicleRows vehicles={vehicles.slice(0,5)} onAction={handleVehicleAction} canDrive={!!canDrive} currentUserId={profile.id} activeTrips={activeTrips} isAdmin={!!isAdmin} onEdit={(v)=>{setEditingVehicle(v);setModal('vehicle-edit');}} onDelete={deleteVehicle}/></section><section className="panel"><div className="panel-head"><div><h3>Últimas movimentações</h3><p>Retiradas e devoluções recentes</p></div></div><TripRows trips={trips.slice(0,6)} vehicles={vehicles} drivers={drivers} currentUserId={profile.id} isAdmin={!!isAdmin}/></section></div></>}
 {tab==='vehicles'&&<section className="panel"><div className="panel-head wrap-head"><div><h3>Cadastro de veículos</h3><p>Gerencie os veículos da empresa</p></div><div className="head-actions"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar placa ou modelo"/></div>{isAdmin&&<button className="primary" onClick={()=>setModal('vehicle')}><Plus size={17}/> Novo veículo</button>}</div></div><VehicleRows vehicles={filtered} onAction={handleVehicleAction} canDrive={!!canDrive} currentUserId={profile.id} activeTrips={activeTrips} isAdmin={!!isAdmin} onEdit={(v)=>{setEditingVehicle(v);setModal('vehicle-edit');}} onDelete={deleteVehicle}/></section>}
 {tab==='drivers'&&<section className="panel"><div className="panel-head"><div><h3>Motoristas autorizados</h3><p>Contas individuais com acesso à frota</p></div><button className="primary" onClick={()=>setModal('driver')}><Plus size={17}/> Cadastrar motorista</button></div><div className="table-wrap"><table><thead><tr><th>Motorista</th><th>Perfil</th><th>Status</th></tr></thead><tbody>{drivers.filter(d=>d.role==='driver').map(d=><tr key={d.id}><td><b>{d.full_name}</b></td><td>Motorista</td><td><span className={d.active?'pill green':'pill red'}>{d.active?'Autorizado':'Bloqueado'}</span></td></tr>)}</tbody></table></div></section>}
 {tab==='trips'&&<section className="panel"><div className="panel-head"><div><h3>Histórico de utilização</h3><p>Registro de todas as retiradas e devoluções</p></div></div><TripRows trips={trips} vehicles={vehicles} drivers={drivers} detailed currentUserId={profile.id} isAdmin={!!isAdmin} onDelete={deleteTrip}/></section>}
 {tab==='maintenance'&&<Maintenance vehicles={vehicles} admin={!!isAdmin} onDone={()=>{setNotice('Solicitação registrada.');load()}}/>}
 {tab==='fuel'&&<FuelLog vehicles={vehicles} drivers={drivers} currentUser={profile} admin={!!isAdmin} onDone={()=>{setNotice('Abastecimento registrado.');load()}}/>}
 </main>
 {modal&&<Modal title={modal==='vehicle'?'Cadastrar veículo':modal==='vehicle-edit'?'Editar veículo':modal==='driver'?'Cadastrar motorista':modal==='checkout'?'Retirada de veículo':'Devolução de veículo'} onClose={()=>setModal(null)}>{(modal==='vehicle'||modal==='vehicle-edit')?<form className="stack" onSubmit={saveVehicle}><label>Placa<input name="plate" required placeholder="ABC1D23" maxLength={7} defaultValue={editingVehicle?.plate||''}/></label><div className="two"><label>Marca<input name="brand" required placeholder="Fiat" defaultValue={editingVehicle?.brand||''}/></label><label>Modelo<input name="model" required placeholder="Strada" defaultValue={editingVehicle?.model||''}/></label></div><div className="two"><label>Ano<input name="year" type="number" min="1950" max="2099" defaultValue={editingVehicle?.year||''}/></label><label>KM atual<input name="km" type="number" min="0" required defaultValue={editingVehicle?.current_km??0}/></label></div><button className="primary full">{modal==='vehicle-edit'?'Salvar alterações':'Cadastrar veículo'}</button></form>:modal==='driver'?<form className="stack" onSubmit={saveDriver}><label>Nome completo<input name="name" required/></label><label>E-mail de acesso<input name="email" type="email" required/></label><label>Senha inicial<input name="password" type="password" minLength={8} required/></label><p className="hint">O cadastro utiliza uma função administrativa segura do Supabase. Não coloque a chave service role no aplicativo.</p><button className="primary full">Criar e autorizar motorista</button></form>:modal==='checkout'?<form className="stack" onSubmit={checkout}><div className="vehicle-focus"><b>{selected?.plate} · {selected?.brand} {selected?.model}</b><span>KM registrado: {fmtKm(selected?.current_km||0)}</span></div><label>KM no momento da retirada<input name="km" type="number" min={selected?.current_km||0} required defaultValue={selected?.current_km||0}/></label><label>
  Foto do painel na retirada *
  <input name="photo" type="file" accept="image/*" capture="environment" required />
  <small className="hint">Fotografe o painel mostrando a quilometragem.</small>
</label><label>Observações<textarea name="notes" rows={3} placeholder="Condições do veículo, avarias..."/></label><button className="primary full"><ArrowUpFromLine size={17}/> Confirmar retirada</button></form>:<form className="stack" onSubmit={checkin}><div className="vehicle-focus"><b>{selected?.plate} · {selected?.brand} {selected?.model}</b><span>KM na retirada: {fmtKm(activeTrips.find(t=>t.vehicle_id===selected?.id)?.start_km||selected?.current_km||0)}</span></div><label>KM no momento da devolução<input name="km" type="number" min={activeTrips.find(t=>t.vehicle_id===selected?.id)?.start_km||selected?.current_km||0} required/></label><label>
  Foto do painel na devolução *
  <input name="photo" type="file" accept="image/*" capture="environment" required />
  <small className="hint">Fotografe o painel mostrando a quilometragem final.</small>
</label>

<label>
  Observações
  <textarea name="notes" rows={3} placeholder="Informar problemas ou avarias, se houver"/>
</label><button className="primary full"><ArrowDownToLine size={17}/> Confirmar devolução</button></form>}</Modal>}
 </div>;
}
function Stat({icon,label,value,tone}:{icon:ReactNode;label:string;value:number;tone:string}){return <div className="stat"><div className={'stat-icon '+tone}>{icon}</div><div><span>{label}</span><b>{value}</b></div></div>}
function VehicleRows({vehicles,onAction,canDrive,currentUserId,activeTrips,isAdmin,onEdit,onDelete}:{vehicles:Vehicle[];onAction:(v:Vehicle)=>void;canDrive:boolean;currentUserId:string;activeTrips:Trip[];isAdmin:boolean;onEdit:(v:Vehicle)=>void;onDelete:(v:Vehicle)=>void}){if(!vehicles.length)return <div className="empty">Nenhum veículo cadastrado.</div>;return <div className="vehicle-list">{vehicles.map(v=>{const trip=activeTrips.find(t=>t.vehicle_id===v.id);const canReturn=v.status==='in_use'&&trip?.driver_id===currentUserId;const canCheckout=v.status==='available';return <div className="vehicle-row" key={v.id}><div className="vehicle-icon"><CarFront/></div><div className="vehicle-info"><b>{v.plate} <span className="muted">· {v.brand} {v.model}</span></b><small>{v.year||'Ano não informado'} · {fmtKm(v.current_km)}</small></div><span className={'pill '+(v.status==='available'?'green':v.status==='in_use'?'orange':v.status==='maintenance'?'purple':'gray')}>{statusLabel[v.status]}</span>{canDrive&&(canCheckout||canReturn)&&<button className="small-btn" onClick={()=>onAction(v)}>{canReturn?'Devolver':'Retirar'}</button>}{isAdmin&&<><button className="small-btn" title="Editar veículo" onClick={()=>onEdit(v)}><Pencil size={15}/> Editar</button><button className="small-btn" title="Remover veículo" onClick={()=>onDelete(v)} disabled={v.status==='in_use'}><Trash2 size={15}/> Remover</button></>}</div>})}</div>}

function TripRows({
  trips,
  vehicles,
  drivers,
  detailed = false,
  currentUserId,
  isAdmin = false,
  onDelete
}: {
  trips: Trip[];
  vehicles: Vehicle[];
  drivers: Profile[];
  detailed?: boolean;
  currentUserId: string;
  isAdmin?: boolean;
  onDelete?: (trip: Trip) => void;
}) {
  const [photoUrls, setPhotoUrls] = useState<
    Record<string, { start?: string; end?: string }>
  >({});

  useEffect(() => {
    let cancelled = false;

    async function loadPhotoUrls() {
      if (!supabase || !trips.length) {
        setPhotoUrls({});
        return;
      }
   const storage = supabase.storage;

      const results = await Promise.all(
        trips.map(async (trip) => {
          if (!isAdmin && trip.driver_id !== currentUserId) return { id: trip.id };
          const [startResult, endResult] = await Promise.all([
            trip.start_photo_path
              ? storage
                  .from('trip-odometer-photos')
                  .createSignedUrl(trip.start_photo_path, 3600)
              : Promise.resolve(null),

            trip.end_photo_path
              ? storage
                  .from('trip-odometer-photos')
                  .createSignedUrl(trip.end_photo_path, 3600)
              : Promise.resolve(null)
          ]);

          return {
            id: trip.id,
            start: startResult?.data?.signedUrl,
            end: endResult?.data?.signedUrl
          };
        })
      );

      if (!cancelled) {
        const urls: Record<string, { start?: string; end?: string }> = {};

        results.forEach((result) => {
          urls[result.id] = {
            start: result.start,
            end: result.end
          };
        });

        setPhotoUrls(urls);
      }
    }

    loadPhotoUrls();

    return () => {
      cancelled = true;
    };
  }, [trips,currentUserId,isAdmin]);

  if (!trips.length) {
    return <div className="empty">Nenhuma movimentação registrada.</div>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Veículo</th>
            <th>Motorista</th>
            <th>Data/hora retirada</th>
            <th>Data/hora devolução</th>
            <th>KM saída</th>
            <th>KM retorno</th>
            {detailed && <th>Distância</th>}
            {detailed && <th>Fotos do painel</th>}
            <th>Situação</th>
            {detailed && isAdmin && <th>Ações</th>}
          </tr>
        </thead>

        <tbody>
          {trips.map((t) => {
            const v = vehicles.find((x) => x.id === t.vehicle_id);
            const d = drivers.find((x) => x.id === t.driver_id);
            const photos = photoUrls[t.id];

            return (
              <tr key={t.id}>
                <td><b>{v?.plate || 'Veículo'}</b></td>
                <td>{d?.full_name || 'Motorista'}</td>
<td>
  {t.started_at
    ? new Date(t.started_at).toLocaleString('pt-BR')
    : '—'}
</td>
<td>
  {t.ended_at
    ? new Date(t.ended_at).toLocaleString('pt-BR')
    : 'Em aberto'}
</td>
                <td>{fmtKm(t.start_km)}</td>
                <td>{t.end_km === null ? '—' : fmtKm(t.end_km)}</td>

                {detailed && (
                  <td>
                    {t.end_km === null
                      ? '—'
                      : fmtKm(t.end_km - t.start_km)}
                  </td>
                )}

                {detailed && (
                  <td>
                    {photos?.start && (isAdmin || t.driver_id===currentUserId) ? (
                      <a href={photos.start} target="_blank" rel="noreferrer">
                        Retirada
                      </a>
                    ) : (
                      '—'
                    )}

                    {' · '}

                    {photos?.end && (isAdmin || t.driver_id===currentUserId) ? (
                      <a href={photos.end} target="_blank" rel="noreferrer">
                        Devolução
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                )}

                <td>
                  <span className={t.ended_at ? 'pill green' : 'pill orange'}>
                    {t.ended_at ? 'Devolvido' : 'Em uso'}
                  </span>
                </td>
                {detailed && isAdmin && <td><button className="small-btn" disabled={!t.ended_at} title={!t.ended_at?'Movimentação em andamento não pode ser excluída':'Excluir movimentação'} onClick={()=>onDelete?.(t)}><Trash2 size={15}/> Excluir</button></td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function Maintenance({vehicles,admin,onDone}:{vehicles:Vehicle[];admin:boolean;onDone:()=>void}){
  const [msg,setMsg]=useState('');
  const [records,setRecords]=useState<any[]>([]);
  const [loadingRecords,setLoadingRecords]=useState(false);

  async function loadRecords(){
    if(!supabase||!admin)return;
    setLoadingRecords(true);
    const {data,error}=await supabase.from('maintenance').select('*').order('service_date',{ascending:false}).limit(100);
    if(error)setMsg('Erro ao carregar manutenções: '+error.message);
    else setRecords(data||[]);
    setLoadingRecords(false);
  }

  useEffect(()=>{loadRecords();},[admin]);

  async function deleteRecord(record:any){
    if(!supabase||!admin)return;
    const vehicle=vehicles.find(v=>v.id===record.vehicle_id);
    const date=String(record.service_date||'').split('-').reverse().join('/');
    if(!window.confirm('Confirma excluir esta manutenção?\n\nVeículo: '+(vehicle?.plate||'Não identificado')+'\nServiço: '+record.description+'\nData: '+date+'\n\nEsta ação não poderá ser desfeita.'))return;
    const {error}=await supabase.from('maintenance').delete().eq('id',record.id);
    if(error){setMsg('Não foi possível excluir: '+error.message);return;}
    setMsg('Manutenção excluída com sucesso.');
    await loadRecords();
    onDone();
  }
  async function releaseVehicle(vehicle:Vehicle){
    if(!supabase||!admin)return;

    if(!window.confirm(
      `Confirma retirar o veículo ${vehicle.plate} da manutenção e deixá-lo disponível?`
    ))return;

    const {error}=await supabase
      .from('vehicles')
      .update({status:'available'})
      .eq('id',vehicle.id);

    if(error){
      setMsg('Não foi possível liberar o veículo: '+error.message);
      return;
    }

    setMsg(`Veículo ${vehicle.plate} liberado e disponível para retirada.`);
    onDone();
  }

  return <section className="panel">
    <div className="panel-head"><div><h3>Controle de manutenção</h3><p>Registre manutenções e acompanhe os veículos em oficina</p></div></div>
    <div className="empty-state"><Wrench size={36}/><b>Módulo de manutenção</b><p>Use o formulário para registrar uma manutenção e atualizar a situação do veículo.</p></div>
    {admin&&<form className="inline-form" onSubmit={async e=>{
      e.preventDefault();
      if(!supabase)return;
      const f=new FormData(e.currentTarget);
      const {error}=await supabase.from('maintenance').insert({
        vehicle_id:f.get('vehicle'),
        description:f.get('description'),
        cost:Number(f.get('cost'))||0,
        service_date:f.get('date')
      });
      if(error){setMsg(error.message);return;}
      await supabase.from('vehicles').update({status:'maintenance'}).eq('id',String(f.get('vehicle')));
      setMsg('Manutenção registrada.');
      e.currentTarget.reset();
      await loadRecords();
      onDone();
    }}>
      <select name="vehicle" required>{vehicles.map(v=><option value={v.id} key={v.id}>{v.plate} · {v.model}</option>)}</select>
      <input name="description" required placeholder="Serviço realizado"/>
      <input name="date" type="date" required/>
      <input name="cost" type="number" min="0" step="0.01" placeholder="Custo R$"/>
      <button className="primary">Registrar</button>
    </form>}
      {msg&&<p className="hint">{msg}</p>}

{admin&&(
  <div style={{marginTop:24}}>
    <div className="panel-head">
      <div>
        <h3>Veículos em manutenção</h3>
        <p>Libere os veículos quando retornarem da oficina</p>
      </div>
    </div>

    {vehicles.filter(v=>v.status==='maintenance').length===0 ? (
      <p className="empty">Nenhum veículo em manutenção.</p>
    ) : (
      <div className="vehicle-list">
        {vehicles.filter(v=>v.status==='maintenance').map(vehicle=>(
          <div className="vehicle-row" key={vehicle.id}>
            <div className="vehicle-icon"><CarFront/></div>
            <div className="vehicle-info">
              <b>{vehicle.plate} · {vehicle.brand} {vehicle.model}</b>
              <small>{fmtKm(vehicle.current_km)}</small>
            </div>
            <span className="pill purple">Em manutenção</span>
            <button
              type="button"
              className="small-btn"
              onClick={()=>releaseVehicle(vehicle)}
            >
              <CheckCircle2 size={15}/> Retirar da manutenção
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
)}

{admin&&<>  
      <div className="panel-head" style={{marginTop:24}}><div><h3>Histórico de manutenções</h3><p>Registros mais recentes</p></div></div>
      {loadingRecords?<p className="empty">Carregando histórico...</p>:records.length===0?<p className="empty">Nenhuma manutenção registrada.</p>:
        <div className="table-wrap"><table><thead><tr><th>Data</th><th>Veículo</th><th>Serviço</th><th>Custo</th><th>Ação</th></tr></thead><tbody>
          {records.map(record=>{
            const vehicle=vehicles.find(v=>v.id===record.vehicle_id);
            return <tr key={record.id}>
              <td>{String(record.service_date||'').split('-').reverse().join('/')}</td>
              <td><b>{vehicle?.plate||'Veículo não encontrado'}</b></td>
              <td>{record.description}</td>
              <td>{fmtMoney(Number(record.cost)||0)}</td>
              <td><button type="button" className="small-btn" onClick={()=>deleteRecord(record)}><Trash2 size={15}/> Excluir</button></td>
            </tr>;
          })}
        </tbody></table></div>
      }
    </>}
  </section>;
}

function FuelLog({vehicles,drivers,currentUser,admin,onDone}:{vehicles:Vehicle[];drivers:Profile[];currentUser:Profile;admin:boolean;onDone:()=>void}){
  const [msg,setMsg]=useState('');
  const [records,setRecords]=useState<any[]>([]);
  const [loadingRecords,setLoadingRecords]=useState(false);

  async function loadRecords(){
    if(!supabase)return;
    setLoadingRecords(true);
    const {data,error}=await supabase.from('fuel_logs').select('*').order('fueled_at',{ascending:false}).limit(100);
    if(error)setMsg('Erro ao carregar abastecimentos: '+error.message);
    else setRecords(data||[]);
    setLoadingRecords(false);
  }

  useEffect(()=>{loadRecords();},[]);

  async function deleteRecord(record:any){
    if(!supabase||!admin)return;
    const vehicle=vehicles.find(v=>v.id===record.vehicle_id);
    const date=record.fueled_at?new Date(record.fueled_at).toLocaleString('pt-BR'):'Data não informada';
    if(!window.confirm('Confirma excluir este abastecimento?\n\nVeículo: '+(vehicle?.plate||'Não identificado')+'\nData: '+date+'\nLitros: '+record.liters+'\nValor: '+fmtMoney(Number(record.total_cost)||0)+'\n\nEsta ação não poderá ser desfeita.'))return;
    const {error}=await supabase.from('fuel_logs').delete().eq('id',record.id);
    if(error){setMsg('Não foi possível excluir: '+error.message);return;}
    setMsg('Abastecimento excluído com sucesso.');
    await loadRecords();
    onDone();
  }

  return <section className="panel">
    <div className="panel-head"><div><h3>Abastecimentos</h3><p>Registre litros, valor e quilometragem para acompanhar consumo</p></div></div>
    <form className="inline-form" onSubmit={async e=>{
      e.preventDefault();
      if(!supabase)return;
      const f=new FormData(e.currentTarget);
      const {error}=await supabase.from('fuel_logs').insert({
        vehicle_id:f.get('vehicle'),
        driver_id:admin?(f.get('driver')||null):currentUser.id,
        liters:Number(f.get('liters')),
        total_cost:Number(f.get('cost')),
        odometer_km:Number(f.get('km')),
        station:f.get('station')||null
      });
      if(error){setMsg(error.message);return;}
      setMsg('Abastecimento registrado.');
      e.currentTarget.reset();
      await loadRecords();
      onDone();
    }}>
      <select name="vehicle" required>{vehicles.map(v=><option key={v.id} value={v.id}>{v.plate} · {v.model}</option>)}</select>
      {admin&&<select name="driver"><option value="">Motorista (opcional)</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.full_name}</option>)}</select>}
      <input name="liters" type="number" step="0.01" min="0.01" placeholder="Litros" required/>
      <input name="cost" type="number" step="0.01" min="0" placeholder="Valor total R$" required/>
      <input name="km" type="number" min="0" placeholder="KM atual" required/>
      <input name="station" placeholder="Posto"/>
      <button className="primary">Salvar abastecimento</button>
    </form>
    {msg&&<p className="hint">{msg}</p>}
    <div className="panel-head" style={{marginTop:24}}><div><h3>Histórico de abastecimentos</h3><p>Últimos registros da frota</p></div></div>
    {loadingRecords?<p className="empty">Carregando histórico...</p>:records.length===0?<p className="empty">Nenhum abastecimento registrado.</p>:
      <div className="table-wrap"><table><thead><tr><th>Data</th><th>Veículo</th><th>Motorista</th><th>Litros</th><th>Valor</th><th>KM</th><th>Posto</th>{admin&&<th>Ação</th>}</tr></thead><tbody>
        {records.map(record=>{
          const vehicle=vehicles.find(v=>v.id===record.vehicle_id);
          const driver=drivers.find(d=>d.id===record.driver_id);
          return <tr key={record.id}>
            <td>{record.fueled_at?new Date(record.fueled_at).toLocaleString('pt-BR'):'-'}</td>
            <td><b>{vehicle?.plate||'Não identificado'}</b></td>
            <td>{driver?.full_name||'-'}</td>
            <td>{Number(record.liters).toLocaleString('pt-BR')} L</td>
            <td>{fmtMoney(Number(record.total_cost)||0)}</td>
            <td>{fmtKm(Number(record.odometer_km)||0)}</td>
            <td>{record.station||'-'}</td>
            {admin&&<td><button type="button" className="small-btn" onClick={()=>deleteRecord(record)}><Trash2 size={15}/> Excluir</button></td>}
          </tr>;
        })}
      </tbody></table></div>
    }
  </section>;
}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={onClose}><X/></button></div>{children}</div></div>}
function SetupScreen(){return <div className="login-wrap"><div className="login-card"><img src="/logo-vm.png" className="login-logo"/><h1>VM <span>FROTAS</span></h1><div className="setup-box"><b>Configuração inicial necessária</b><p>Crie o projeto no Supabase, execute o arquivo <code>supabase/schema.sql</code> e configure as variáveis de ambiente no arquivo <code>.env</code>.</p><p>Consulte o <code>README.md</code> incluído no projeto para seguir o passo a passo.</p></div></div></div>}
