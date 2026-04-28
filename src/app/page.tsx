import Link from 'next/link';
import './landing.css';

const O = "#d97706";
const OL = "#f59e0b";
const OBG = "#fffbeb";

export default function LandingPage() {
  return (
    <div className="landing">
      {/* NAV */}
      <nav className="l-nav">
        <div className="l-logo">Bid<span>Master</span></div>
        <div className="l-nav-links">
          <a href="#why">Why BidMaster</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
        </div>
        <div className="l-nav-actions">
          <Link href="/login" className="l-nav-login">Log In</Link>
          <Link href="/register" className="l-nav-cta">Get Started &rarr;</Link>
        </div>
      </nav>

      {/* HERO */}
      <section className="l-hero">
        <div className="l-hero-text">
          <div className="l-badge">
            <span>&#9889;</span> Built for General Contractors
          </div>
          <h1 className="l-title">
            All Your Bids.<br />One <span className="l-accent">Dashboard</span>.
          </h1>
          <p className="l-sub">
            Manage every bid across all your projects in one place. Send requests, collect vendor quotes, compare prices side-by-side with AI-powered document scanning &mdash; and track it all live.
          </p>
          <div className="l-hero-actions">
            <Link href="/register" className="l-btn-primary">Get Started &mdash; $199/mo &rarr;</Link>
            <a href="#why" className="l-btn-ghost">See why contractors love it &darr;</a>
          </div>
        </div>
        <div className="l-hero-visual">
          <div className="l-dash">
            <div className="l-dash-header">
              <div className="l-dot r" />
              <div className="l-dot y" />
              <div className="l-dot g" />
              <span className="l-dash-title">BidMaster &mdash; Kitchen Cabinets</span>
            </div>
            <div className="l-dash-body">
              <div className="l-row l-row-win">
                <span className="l-cell-name">&#11088; Manhattan Cabinets</span>
                <span className="l-cell-price">$48,200</span>
                <span className="l-cell-meta">6 wks</span>
                <span className="l-tag l-tag-win">Winner</span>
              </div>
              <div className="l-row">
                <span className="l-cell-name">Brooklyn Mill Supply</span>
                <span className="l-cell-price">$42,650</span>
                <span className="l-cell-meta">5 wks</span>
                <span className="l-tag l-tag-rev">Reviewed</span>
              </div>
              <div className="l-row">
                <span className="l-cell-name">Queens Woodcraft</span>
                <span className="l-cell-meta">&mdash;</span>
                <span className="l-cell-meta">&mdash;</span>
                <span className="l-tag l-tag-pen">Pending</span>
              </div>
              <div className="l-stats">
                <div className="l-stat">
                  <div className="l-stat-label">Responses</div>
                  <div className="l-stat-val">2/3</div>
                </div>
                <div className="l-stat">
                  <div className="l-stat-label">Lowest Bid</div>
                  <div className="l-stat-val l-stat-accent">$42,650</div>
                </div>
                <div className="l-stat">
                  <div className="l-stat-label">AI Scanned</div>
                  <div className="l-stat-val l-stat-accent">2 docs</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WHY BIDMASTER */}
      <section className="l-section" id="why">
        <div className="l-section-inner">
          <div className="l-label">Why BidMaster</div>
          <h2 className="l-heading">Stop Juggling Spreadsheets,<br />Emails, and Phone Calls</h2>
          <p className="l-desc">Built specifically for general contractors who manage multiple projects and need to keep every bid, vendor, and quote organized in one place.</p>
          <div className="l-steps">
            <div className="l-step">
              <div className="l-step-num">01</div>
              <div className="l-step-icon">&#128202;</div>
              <h3>Live Price Comparison</h3>
              <p>See all vendor quotes side-by-side the moment they come in. Compare prices, specs, and timelines across every bid &mdash; updated in real time as vendors respond.</p>
            </div>
            <div className="l-step">
              <div className="l-step-num">02</div>
              <div className="l-step-icon">&#129302;</div>
              <h3>AI Document Scanning</h3>
              <p>Upload any vendor quote &mdash; PDF, photo, or document. AI reads it and automatically extracts prices, specs, and line items into your comparison table. No manual data entry.</p>
            </div>
            <div className="l-step">
              <div className="l-step-num">03</div>
              <div className="l-step-icon">&#128200;</div>
              <h3>Project Budget Tracking</h3>
              <p>Set a budget per project and watch it update live as bids are awarded. See how much you&apos;ve saved versus your budget &mdash; track spending across all your trades.</p>
            </div>
            <div className="l-step">
              <div className="l-step-num">04</div>
              <div className="l-step-icon">&#128101;</div>
              <h3>Team Access Control</h3>
              <p>Invite team members and control exactly what they see. Assign access per project, hide budget data from field staff, and keep full editing control with the primary account.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="l-section l-features-bg" id="features">
        <div className="l-section-inner">
          <div className="l-label">Features</div>
          <h2 className="l-heading">Everything a GC Needs<br />to Manage Bids</h2>
          <p className="l-desc">From sending the first bid request to awarding the winner &mdash; every step is covered.</p>
          <div className="l-features">
            <div className="l-feature">
              <div className="l-feature-icon">&#129302;</div>
              <h3>AI Document Scanning</h3>
              <p>Upload vendor quotes as PDF, images, or spreadsheets. AI reads the document and auto-fills your comparison table with prices, specs, and line items.</p>
            </div>
            <div className="l-feature">
              <div className="l-feature-icon">&#128202;</div>
              <h3>Live Bid Comparison</h3>
              <p>All vendor proposals organized in one clear table, updated in real time. Filter by spec, sort by price, and see exactly where each vendor stands.</p>
            </div>
            <div className="l-feature">
              <div className="l-feature-icon">&#128176;</div>
              <h3>Budget Management</h3>
              <p>Set project budgets and track spending as bids are awarded. See real-time savings, budget utilization, and cost breakdowns across all trades.</p>
            </div>
            <div className="l-feature">
              <div className="l-feature-icon">&#128232;</div>
              <h3>Vendor Portal</h3>
              <p>Vendors submit structured proposals through a clean portal &mdash; no account needed. They get a unique link, fill in specs, attach documents, and submit.</p>
            </div>
            <div className="l-feature">
              <div className="l-feature-icon">&#128276;</div>
              <h3>Bid Tracking &amp; Reminders</h3>
              <p>Know exactly which vendors opened your request, who responded, and who needs a follow-up. Automatic reminders go out before deadlines &mdash; you don&apos;t chase anyone.</p>
            </div>
            <div className="l-feature">
              <div className="l-feature-icon">&#127942;</div>
              <h3>Winner Selection &amp; Notifications</h3>
              <p>Pick a winner with one click. BidMaster sends professional award and regret notices to all vendors automatically.</p>
            </div>
            <div className="l-feature">
              <div className="l-feature-icon">&#128101;</div>
              <h3>Team &amp; Permissions</h3>
              <p>Invite your project managers and field staff with controlled access. Define who sees which projects and what data &mdash; keep budgets and sensitive info restricted.</p>
            </div>
            <div className="l-feature">
              <div className="l-feature-icon">&#128193;</div>
              <h3>Files &amp; Attachments</h3>
              <p>Attach plans, specs, and drawings to any bid. Support for Dropbox links, URL uploads, and drag-and-drop. Vendors can attach their own docs too.</p>
            </div>
            <div className="l-feature">
              <div className="l-feature-icon">&#128203;</div>
              <h3>Bid Templates</h3>
              <p>Pre-built bid forms for 25+ trade categories &mdash; electrical, plumbing, HVAC, millwork, and more. Start with a professional template and customize as needed.</p>
            </div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="l-section" id="pricing">
        <div className="l-pricing-wrap">
          <div className="l-label" style={{ textAlign: 'center' }}>Pricing</div>
          <h2 className="l-heading" style={{ textAlign: 'center' }}>Simple, Transparent Pricing</h2>
          <p className="l-desc" style={{ textAlign: 'center', margin: '0 auto 48px' }}>Everything included. No per-vendor fees, no hidden charges.</p>

          <div className="l-pricing-card">
            <div className="l-pricing-top" />
            <div className="l-label">Professional Plan</div>
            <div className="l-pricing-price">
              <span className="l-price-dollar">$</span>
              <span className="l-price-num">199</span>
              <span className="l-price-period">/ month</span>
            </div>
            <p className="l-desc" style={{ marginBottom: 28 }}>Full access to every feature. Cancel anytime.</p>
            <ul className="l-pricing-list">
              <li><span className="l-check">&#10003;</span> Unlimited projects &amp; bid requests</li>
              <li><span className="l-check">&#10003;</span> AI document scanning &amp; extraction</li>
              <li><span className="l-check">&#10003;</span> Live bid comparison tables</li>
              <li><span className="l-check">&#10003;</span> Project budget tracking &amp; savings</li>
              <li><span className="l-check">&#10003;</span> Unlimited vendor invitations</li>
              <li><span className="l-check">&#10003;</span> Bid tracking &amp; automatic reminders</li>
              <li><span className="l-check">&#10003;</span> Winner/regret email notifications</li>
              <li><span className="l-check">&#10003;</span> File uploads &amp; vendor attachments</li>
              <li><span className="l-check">&#10003;</span> 25+ trade category templates</li>
              <li><span className="l-check">&#10003;</span> Team access with permissions</li>
              <li><span className="l-check">&#10003;</span> Vendor portal with self-service</li>
              <li><span className="l-check">&#10003;</span> Priority email support</li>
            </ul>
            <p style={{ fontSize: '0.78rem', color: '#999', marginBottom: 16, textAlign: 'center' }}>Additional editing seats: $49/mo each</p>
            <Link href="/register" className="l-btn-full">Subscribe Now &mdash; $199/mo &rarr;</Link>
            <p style={{ textAlign: 'center', marginTop: 12, fontSize: '0.78rem', color: '#999' }}>Cancel anytime. Billed monthly via Stripe.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="l-cta">
        <div className="l-label" style={{ textAlign: 'center' }}>Get Started</div>
        <h2 className="l-heading" style={{ textAlign: 'center' }}>Stop Chasing Vendors.<br />Start Managing Bids.</h2>
        <p className="l-desc" style={{ textAlign: 'center', maxWidth: 480, margin: '0 auto 40px' }}>Every bid, every vendor, every project &mdash; managed from one dashboard with AI-powered document scanning and live price comparison.</p>
        <div style={{ textAlign: 'center' }}>
          <Link href="/register" className="l-btn-primary">Get Started &mdash; $199/mo &rarr;</Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="l-footer">
        <div className="l-footer-left">
          <div className="l-logo" style={{ fontSize: '1.1rem' }}>Bid<span>Master</span></div>
          <div className="l-footer-links">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Support</a>
            <a href="mailto:info@bidmaster.app">Contact</a>
          </div>
        </div>
        <div className="l-footer-copy">&copy; {new Date().getFullYear()} BidMaster. All rights reserved.</div>
      </footer>
    </div>
  );
}
