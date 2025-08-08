import { useEffect } from 'react';
import { useAuthStore } from './store/auth';
import { AppRoutes } from './routes';

export default function App() {
  const init = useAuthStore(s => s.initFromStorage);
  useEffect(() => { init(); }, [init]);
  return <AppRoutes />;
}
