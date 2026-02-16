import { Routes, Route } from 'react-router-dom';
import { Landing } from './pages/Landing';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      {/* TODO: Add routes */}
      {/* <Route path="/dashboard" element={<Dashboard />} /> */}
      {/* <Route path="/login" element={<Login />} /> */}
    </Routes>
  );
}
