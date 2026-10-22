import { NavLink } from "react-router-dom";
import "./Nav.css";

const links = [
  { to: "/", label: "Ask", end: true },
  { to: "/today", label: "Today" },
  { to: "/why", label: "Why?" },
  { to: "/about", label: "About" },
];

export function Nav() {
  return (
    <header className="site-nav">
      <div className="site-nav__inner">
        <NavLink to="/" className="site-nav__brand" end>
          <span className="site-nav__mark" aria-hidden="true">
            ▦
          </span>
          <span className="site-nav__name">haqi</span>
          <span className="site-nav__tag">air answers</span>
        </NavLink>
        <nav aria-label="Primary">
          <ul className="site-nav__list">
            {links.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    isActive ? "site-nav__link is-active" : "site-nav__link"
                  }
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
