import { Link, NavLink } from 'react-router';
import './Navbar.css';

const navItems = [
  { to: '/movies', label: 'Films populaires' },
  { to: '/about', label: 'À propos' },
];

export default function Navbar() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="site-header__brand" to="/movies">
          TMDB DISCOVERY
        </Link>

        <nav className="site-header__nav" aria-label="Navigation principale">
          {navItems.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `site-header__link ${isActive ? 'site-header__link--active' : ''}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}