'use client';

import { useState } from 'react';
import { useToast } from '../layout';

interface ContentEditor {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
}

const editors: ContentEditor[] = [
  { id: 'pages', title: 'All Pages Content Editor', description: 'Edit EVERY page (Features, Pricing, Security, Updates, About, Careers, Contact, Blog) + Footer Links', icon: '✏️', color: 'var(--gold)' },
  { id: 'marketing', title: 'Marketing Content Editor', description: 'Edit marketing sections, feature cards, benefits, statistics, and CTAs from the screenshots', icon: '✏️', color: 'var(--ink)' },
  { id: 'legal', title: 'Legal Documents Editor', description: 'Edit full Terms of Service and Privacy Policy content, sections, and subsections', icon: '✏️', color: 'var(--gold)' },
  { id: 'help', title: 'Help Content Editor', description: 'Manage help articles, FAQs, categories, and support contact information', icon: '✏️', color: 'var(--ink)' },
];

export default function ContentPage() {
  const toast = useToast();
  const [activeEditor, setActiveEditor] = useState<string | null>(null);

  return (
    <>
      <div className="content-editors-grid">
        {editors.map(ed => (
          <div key={ed.id} className="table-card" style={{ marginBottom: 16 }}>
            <div style={{ padding: '24px 22px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: '1.1rem' }}>{ed.icon}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--ink)', marginBottom: 6 }}>{ed.title}</div>
                  <div style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5 }}>{ed.description}</div>
                </div>
              </div>
              <button
                className="btn"
                style={{ background: ed.color, color: '#fff', marginTop: 8 }}
                onClick={() => {
                  setActiveEditor(ed.id);
                  toast(`Opening ${ed.title}...`);
                }}
              >
                ✏️ Open {ed.title.replace(' Editor', '')}
              </button>
            </div>
          </div>
        ))}
      </div>

      {activeEditor && (
        <div className="modal-overlay" onClick={() => setActiveEditor(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setActiveEditor(null)}>✕</button>
            <div className="modal-title">{editors.find(e => e.id === activeEditor)?.title}</div>
            <div className="modal-sub">Edit content below. Changes are saved automatically.</div>

            {activeEditor === 'pages' && <PagesEditor onSave={() => toast('Pages content saved!')} />}
            {activeEditor === 'marketing' && <MarketingEditor onSave={() => toast('Marketing content saved!')} />}
            {activeEditor === 'legal' && <LegalEditor onSave={() => toast('Legal documents saved!')} />}
            {activeEditor === 'help' && <HelpEditor onSave={() => toast('Help content saved!')} />}
          </div>
        </div>
      )}
    </>
  );
}

function PagesEditor({ onSave }: { onSave: () => void }) {
  const pages = ['Features', 'Pricing', 'Security', 'Updates', 'About', 'Careers', 'Contact', 'Blog'];
  const [active, setActive] = useState('Features');
  const [content, setContent] = useState('');

  return (
    <div>
      <div className="filter-chips" style={{ marginBottom: 16 }}>
        {pages.map(p => (
          <span key={p} className={`chip ${active === p ? 'on' : ''}`} onClick={() => setActive(p)}>{p}</span>
        ))}
      </div>
      <div className="fg">
        <label className="flbl">Page Title</label>
        <input className="finput" defaultValue={active} />
      </div>
      <div className="fg">
        <label className="flbl">Page Content</label>
        <textarea className="finput" rows={8} value={content} onChange={e => setContent(e.target.value)} placeholder={`Enter ${active} page content...`} />
      </div>
      <div className="modal-actions">
        <button className="btn btn-gold" onClick={onSave}>Save Changes</button>
      </div>
    </div>
  );
}

function MarketingEditor({ onSave }: { onSave: () => void }) {
  return (
    <div>
      <div className="fg">
        <label className="flbl">Hero Headline</label>
        <input className="finput" defaultValue="Win More Bids. Waste Zero Time." />
      </div>
      <div className="fg">
        <label className="flbl">Hero Subtitle</label>
        <textarea className="finput" rows={3} defaultValue="The all-in-one bid management platform built for NY general contractors." />
      </div>
      <div className="fg">
        <label className="flbl">CTA Button Text</label>
        <input className="finput" defaultValue="Get Started — $199/mo" />
      </div>
      <div className="fg">
        <label className="flbl">Statistics Section</label>
        <div className="finput-grid">
          <input className="finput" defaultValue="500+ Contractors" />
          <input className="finput" defaultValue="$2B+ in Bids" />
          <input className="finput" defaultValue="98% Satisfaction" />
          <input className="finput" defaultValue="24/7 Support" />
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn btn-gold" onClick={onSave}>Save Changes</button>
      </div>
    </div>
  );
}

function LegalEditor({ onSave }: { onSave: () => void }) {
  const [tab, setTab] = useState<'tos' | 'privacy'>('tos');
  return (
    <div>
      <div className="filter-chips" style={{ marginBottom: 16 }}>
        <span className={`chip ${tab === 'tos' ? 'on' : ''}`} onClick={() => setTab('tos')}>Terms of Service</span>
        <span className={`chip ${tab === 'privacy' ? 'on' : ''}`} onClick={() => setTab('privacy')}>Privacy Policy</span>
      </div>
      <div className="fg">
        <label className="flbl">Last Updated</label>
        <input className="finput" type="date" defaultValue="2026-01-15" />
      </div>
      <div className="fg">
        <label className="flbl">Content</label>
        <textarea className="finput" rows={12} placeholder={`Enter ${tab === 'tos' ? 'Terms of Service' : 'Privacy Policy'} content...`} />
      </div>
      <div className="modal-actions">
        <button className="btn btn-gold" onClick={onSave}>Save Changes</button>
      </div>
    </div>
  );
}

function HelpEditor({ onSave }: { onSave: () => void }) {
  const categories = ['Getting Started', 'Account', 'Billing', 'Projects', 'Bids', 'Vendors'];
  return (
    <div>
      <div className="fg">
        <label className="flbl">FAQ Categories</label>
        <div className="filter-chips" style={{ marginBottom: 12 }}>
          {categories.map(c => <span key={c} className="chip">{c}</span>)}
        </div>
      </div>
      <div className="fg">
        <label className="flbl">Support Email</label>
        <input className="finput" defaultValue="support@bidmaster.app" />
      </div>
      <div className="fg">
        <label className="flbl">Support Phone</label>
        <input className="finput" defaultValue="+1 (212) 555-0123" />
      </div>
      <div className="fg">
        <label className="flbl">Add New FAQ</label>
        <input className="finput" placeholder="Question..." style={{ marginBottom: 8 }} />
        <textarea className="finput" rows={4} placeholder="Answer..." />
      </div>
      <div className="modal-actions">
        <button className="btn btn-gold" onClick={onSave}>Save FAQ</button>
      </div>
    </div>
  );
}
