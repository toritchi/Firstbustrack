import './globals.css';
import PwaRegister from './PwaRegister';
export const metadata={title:'Algeria Bus Platform',description:'Real-time public transport for Algeria',manifest:'/manifest.webmanifest'};
export default function RootLayout({children}){return <><PwaRegister/><nav className="nav"><a className="brand" href="/">🚌 <span>Algeria Bus</span></a><div className="navlinks"><a href="/">Home</a><a href="/journey">Plan</a><a href="/routes">Routes</a><a href="/stops">Stops</a><a href="/tickets">Tickets</a><a href="/notifications">Alerts</a><a href="/account">Account</a></div><a className="admin-link" href="/admin">Admin</a></nav>{children}<footer className="footer">Algeria Bus Platform · Live information depends on network and GPS availability.</footer></>}
