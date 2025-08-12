import { Navigate, Route, Routes } from 'react-router-dom';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Dashboard from '../pages/Dashboard';
import Servers from '../pages/Servers';
import ServerDetail from '../pages/ServerDetail';
import Files from '../pages/Files';
import Settings from '../pages/Settings';
import AdminUsers from '../pages/AdminUsers';
import { useAuthStore } from '../store/auth';
import NavBar from '../components/NavBar';

function Authed({ children }: { children: JSX.Element }) {
  const isAuthed = useAuthStore(s => !!s.accessToken);
  return isAuthed ? children : <Navigate to="/login" replace />;
}

function Shell({ children }: { children: JSX.Element }) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
      <NavBar />
      <div className="max-w-7xl mx-auto p-4">{children}</div>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/" element={<Authed><Shell><Dashboard /></Shell></Authed>} />
      <Route path="/servers" element={<Authed><Shell><Servers /></Shell></Authed>} />
      <Route path="/servers/:id" element={<Authed><Shell><ServerDetail /></Shell></Authed>} />
      <Route path="/servers/:id/files" element={<Authed><Shell><Files /></Shell></Authed>} />
      <Route path="/settings" element={<Authed><Shell><Settings /></Shell></Authed>} />
      <Route path="/admin/users" element={<Authed><Shell><AdminUsers /></Shell></Authed>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
