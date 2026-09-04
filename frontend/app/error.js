'use client';
export default function Error({error,reset}){return <main className="container"><div className="card"><span className="eyebrow">Passenger app</span><h1>Something went wrong</h1><p className="muted">{error?.message||'Unexpected application error.'}</p><button className="btn" onClick={()=>reset()}>Try again</button></div></main>}
