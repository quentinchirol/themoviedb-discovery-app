import { Navigate, Outlet, Route, Routes } from 'react-router';
import './app.css';
import Footer from './components/Footer';
import Navbar from './components/Navbar';
import MovieDetailPage from './pages/MovieDetailPage';
import MoviesListPage from './pages/MoviesListPage';
import NotFoundPage from './pages/NotFoundPage';
import AboutPage from './pages/AboutPage';

function PublicLayout() {
  return (
    <>
      <Navbar />
      <Outlet />
      <Footer />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Navigate to="/movies" replace />} />
        <Route path="/movies" element={<MoviesListPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route
          path="/movies/:id"
          element={
            <>
              <MovieDetailPage />
            </>
          }
        />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
