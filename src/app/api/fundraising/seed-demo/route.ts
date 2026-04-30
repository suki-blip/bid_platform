import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { db, dbReady } from '@/lib/db';
import { getFundraisingSession } from '@/lib/fundraising-session';
import { generateInstallmentDates, recomputeDonorTotals } from '@/lib/fundraising-totals';

// Realistic Jewish/Yeshiva fundraising demo data
const SOURCES = ['Gala 2025', 'Referral - Rabbi Cohen', 'Annual dinner', 'Old donor list', 'Website', 'Cold call', 'Wedding Sheva Brachos', 'Friend of Yeshiva'];

const FAKE_DONORS: Array<{
  first: string;
  last: string;
  hebrew?: string;
  title?: string;
  org?: string;
  occupation?: string;
  city: string;
  state: string;
  zip: string;
  street: string;
  email?: string;
  spouse?: string;
  birthday?: string;
  anniversary?: string;
  yahrzeit?: string;
  status: 'prospect' | 'donor';
  tags?: string[];
  source?: string;
  pledgeAmount?: number;
  pledgePlan?: 'lump_sum' | 'monthly' | 'quarterly' | 'annual';
  pledgeInstallments?: number;
  pledgeMethod?: 'check' | 'credit_card' | 'wire' | 'ach';
  pledgeProject?: 'annual' | 'building' | 'general';
  paidInstallments?: number;
  oneTimeDonation?: number;
  oneTimeMethod?: 'check' | 'credit_card' | 'wire';
  oneTimeProject?: 'annual' | 'building' | 'general';
  bouncedFirst?: boolean;
  notes?: string;
  preferredContact?: string;
}> = [
  // ===== Major donors =====
  { first: 'Avraham', last: 'Goldberg', hebrew: 'אברהם גולדברג', title: 'Reb', spouse: 'Rivka', org: 'Goldberg Realty Group', occupation: 'Real Estate', street: '847 Eastern Pkwy', city: 'Brooklyn', state: 'NY', zip: '11213', email: 'a.goldberg@goldbergrealty.com', birthday: '1962-08-12', anniversary: '1985-06-23', status: 'donor', tags: ['major-donor', 'board'], source: 'Gala 2025', pledgeAmount: 100000, pledgePlan: 'monthly', pledgeInstallments: 12, pledgeMethod: 'check', pledgeProject: 'building', paidInstallments: 5, notes: 'Pledged at the gala. Wants a plaque on the new beis medrash. Calls back in the evening.' },
  { first: 'Moshe', last: 'Rabinowitz', hebrew: 'משה רבינוביץ', title: 'Mr.', spouse: 'Chana', org: 'Rabinowitz Diamonds', occupation: 'Diamond Wholesaler', street: '47 W 47th St, Booth 218', city: 'New York', state: 'NY', zip: '10036', email: 'moshe@rabinodiamonds.com', birthday: '1968-03-04', status: 'donor', tags: ['major-donor'], source: 'Referral - Rabbi Cohen', pledgeAmount: 75000, pledgePlan: 'quarterly', pledgeInstallments: 4, pledgeMethod: 'wire', pledgeProject: 'annual', paidInstallments: 2, notes: 'Met through Rabbi Cohen. Wires from his diamond company every quarter.' },
  { first: 'Shmuel', last: 'Friedman', hebrew: 'שמואל פרידמן', title: 'Reb', spouse: 'Sarah', occupation: 'Attorney', street: '12 Oak Knoll Rd', city: 'Lakewood', state: 'NJ', zip: '08701', email: 'sfriedman@friedmanlaw.com', birthday: '1955-11-30', anniversary: '1979-05-14', status: 'donor', tags: ['major-donor', 'pro-bono-counsel'], source: 'Old donor list', pledgeAmount: 50000, pledgePlan: 'monthly', pledgeInstallments: 12, pledgeMethod: 'credit_card', pledgeProject: 'annual', paidInstallments: 4 },
  { first: 'Yitzchak', last: 'Bernstein', hebrew: 'יצחק ברנשטיין', title: 'Mr.', spouse: 'Devorah', org: 'Bernstein & Co. CPAs', occupation: 'CPA', street: '88 Forshay Rd', city: 'Monsey', state: 'NY', zip: '10952', email: 'yitzchak@bernsteincpa.com', birthday: '1970-07-19', status: 'donor', tags: ['board', 'treasurer'], source: 'Old donor list', pledgeAmount: 36000, pledgePlan: 'monthly', pledgeInstallments: 12, pledgeMethod: 'ach', pledgeProject: 'general', paidInstallments: 5, notes: 'Treasurer of the board. Auto-debit from his account on the 15th.' },
  { first: 'Yosef', last: 'Schwartz', hebrew: 'יוסף שווארץ', spouse: 'Miriam', org: 'Schwartz Construction', occupation: 'General Contractor', street: '231 Central Ave', city: 'Lawrence', state: 'NY', zip: '11559', email: 'yossi@schwartzconstruction.com', anniversary: '1992-11-08', status: 'donor', tags: ['major-donor', 'building-fund'], source: 'Annual dinner', pledgeAmount: 250000, pledgePlan: 'annual', pledgeInstallments: 5, pledgeMethod: 'check', pledgeProject: 'building', paidInstallments: 2, bouncedFirst: false, notes: 'Major building campaign donor. His company is doing the construction. 5-year pledge commitment.' },

  // ===== Mid donors =====
  { first: 'Dovid', last: 'Halpern', hebrew: 'דוד הלפרן', spouse: 'Yael', occupation: 'Doctor', street: '14 Bowery Ln', city: 'Brooklyn', state: 'NY', zip: '11218', email: 'dr.halpern@bayhealth.com', birthday: '1975-09-27', status: 'donor', tags: [], source: 'Referral - Rabbi Cohen', pledgeAmount: 18000, pledgePlan: 'monthly', pledgeInstallments: 12, pledgeMethod: 'credit_card', pledgeProject: 'annual', paidInstallments: 5 },
  { first: 'Chaim', last: 'Klein', hebrew: 'חיים קליין', street: '52 Chestnut St', city: 'Lakewood', state: 'NJ', zip: '08701', email: 'chaimk@gmail.com', status: 'donor', source: 'Wedding Sheva Brachos', pledgeAmount: 12000, pledgePlan: 'monthly', pledgeInstallments: 12, pledgeMethod: 'check', pledgeProject: 'annual', paidInstallments: 4, bouncedFirst: true, notes: 'First check bounced — needs follow-up. Replaced with new check.' },
  { first: 'Eliezer', last: 'Stein', hebrew: 'אליעזר שטיין', spouse: 'Rachel', org: 'Stein Insurance', occupation: 'Insurance Broker', street: '187 Lee Ave', city: 'Brooklyn', state: 'NY', zip: '11211', email: 'eli@steininsurance.com', birthday: '1972-12-15', status: 'donor', source: 'Cold call', pledgeAmount: 10000, pledgePlan: 'lump_sum', pledgeInstallments: 1, pledgeMethod: 'check', pledgeProject: 'general' },
  { first: 'Reuven', last: 'Katz', hebrew: 'ראובן כץ', street: '320 Park Ave', city: 'Cedarhurst', state: 'NY', zip: '11516', email: 'rkatz@katzgroup.com', spouse: 'Bracha', anniversary: '1996-08-11', status: 'donor', tags: ['lawyer'], source: 'Friend of Yeshiva', pledgeAmount: 25000, pledgePlan: 'quarterly', pledgeInstallments: 4, pledgeMethod: 'wire', pledgeProject: 'building', paidInstallments: 1 },
  { first: 'Naftali', last: 'Roth', hebrew: 'נפתלי רוט', street: '9 Briarcliff Dr', city: 'Monsey', state: 'NY', zip: '10952', email: 'nroth@rothenterprises.com', org: 'Roth Enterprises', status: 'donor', source: 'Annual dinner', oneTimeDonation: 5000, oneTimeMethod: 'wire', oneTimeProject: 'annual' },
  { first: 'Yehuda', last: 'Levine', hebrew: 'יהודה לוין', street: '73 5th Ave, Apt 4B', city: 'Brooklyn', state: 'NY', zip: '11217', email: 'ylevine@levinetech.com', occupation: 'Software Engineer', status: 'donor', source: 'Website', oneTimeDonation: 1800, oneTimeMethod: 'credit_card', oneTimeProject: 'annual', notes: 'Tech-savvy younger donor. Found us through the website.' },
  { first: 'Aharon', last: 'Weiss', hebrew: 'אהרן ווייס', spouse: 'Rivka', street: '441 Albany Ave', city: 'Brooklyn', state: 'NY', zip: '11203', email: 'aweiss@gmail.com', status: 'donor', source: 'Old donor list', oneTimeDonation: 3600, oneTimeMethod: 'check', oneTimeProject: 'general' },
  { first: 'Gershon', last: 'Polak', hebrew: 'גרשון פולק', occupation: 'Diamond Setter', street: '1242 47th St', city: 'Brooklyn', state: 'NY', zip: '11219', email: 'gpolak@diamondset.com', status: 'donor', source: 'Cold call', oneTimeDonation: 720, oneTimeMethod: 'credit_card', oneTimeProject: 'annual' },
  { first: 'Zev', last: 'Birnbaum', hebrew: 'זאב בירנבוים', spouse: 'Tova', street: '88 Maple Ave', city: 'Lakewood', state: 'NJ', zip: '08701', email: 'zev@birnbaumgroup.com', org: 'Birnbaum Capital', occupation: 'Investor', birthday: '1969-04-22', status: 'donor', tags: ['major-donor'], source: 'Referral - Rabbi Cohen', pledgeAmount: 60000, pledgePlan: 'monthly', pledgeInstallments: 24, pledgeMethod: 'check', pledgeProject: 'building', paidInstallments: 3 },

  // ===== Recent / new donors =====
  { first: 'Mordechai', last: 'Greenfeld', hebrew: 'מרדכי גרינפלד', street: '11 Acres Rd', city: 'Monsey', state: 'NY', zip: '10952', email: 'mgreenfeld@gmail.com', status: 'donor', source: 'Wedding Sheva Brachos', oneTimeDonation: 1000, oneTimeMethod: 'credit_card', oneTimeProject: 'annual' },
  { first: 'Asher', last: 'Shulman', hebrew: 'אשר שולמן', occupation: 'Accountant', street: '522 Skylight Ave', city: 'Far Rockaway', state: 'NY', zip: '11691', email: 'asher.shulman@gmail.com', status: 'donor', source: 'Annual dinner', oneTimeDonation: 2500, oneTimeMethod: 'check', oneTimeProject: 'general' },

  // ===== Prospects =====
  { first: 'Binyamin', last: 'Rosenthal', hebrew: 'בנימין רוזנטל', org: 'Rosenthal Trading', occupation: 'Importer', street: '901 Avenue J', city: 'Brooklyn', state: 'NY', zip: '11230', email: 'binyamin@rosenthaltrading.com', status: 'prospect', tags: ['warm-prospect'], source: 'Referral - Rabbi Cohen', notes: 'Shmuel introduced me. Big in textiles. Setting up a meeting in two weeks. Interested in the building campaign.', preferredContact: 'phone' },
  { first: 'Tzvi', last: 'Mandel', hebrew: 'צבי מנדל', occupation: 'Dentist', street: '15 Cedar Lane', city: 'Teaneck', state: 'NJ', zip: '07666', email: 'drmandel@mandeldental.com', status: 'prospect', source: 'Cold call', notes: 'Cold call after he attended a chasunah at the yeshiva. Asked us to send materials.' },
  { first: 'Pinchas', last: 'Adler', hebrew: 'פנחס אדלר', spouse: 'Esther', street: '7 Highview Rd', city: 'Lakewood', state: 'NJ', zip: '08701', email: 'padler@adlerlaw.com', occupation: 'Attorney', status: 'prospect', tags: ['warm-prospect'], source: 'Friend of Yeshiva', notes: 'Adler & Adler partners. His brother already gives. Visiting next month.' },
  { first: 'Shimon', last: 'Brandman', hebrew: 'שמעון ברנדמן', street: '210 W End Ave', city: 'New York', state: 'NY', zip: '10023', email: 'sbrandman@brandmanfund.com', org: 'Brandman Fund LLC', occupation: 'Hedge Fund Manager', birthday: '1974-02-18', status: 'prospect', tags: ['major-prospect'], source: 'Referral - Rabbi Cohen', notes: 'Major hedge fund. Could be a $100K+ donor. Need a personal meeting from the Rosh Yeshiva.', preferredContact: 'in_person' },
  { first: 'Yaakov', last: 'Edelstein', hebrew: 'יעקב אדלשטיין', occupation: 'Watchmaker', street: '78 Diamond Way', city: 'Brooklyn', state: 'NY', zip: '11204', status: 'prospect', source: 'Wedding Sheva Brachos' },
  { first: 'Avner', last: 'Kessler', hebrew: 'אבנר קסלר', street: '113 Prospect St', city: 'Passaic', state: 'NJ', zip: '07055', email: 'akessler@kesslerfoods.com', org: 'Kessler Foods', status: 'prospect', source: 'Old donor list', notes: 'Used to give 10 years ago. Trying to re-engage.' },
  { first: 'Boruch', last: 'Schick', hebrew: 'ברוך שיק', street: '404 12th Ave', city: 'Brooklyn', state: 'NY', zip: '11219', status: 'prospect', source: 'Cold call' },
  { first: 'Daniel', last: 'Kaplan', hebrew: 'דניאל קפלן', occupation: 'Tech Entrepreneur', street: '550 Madison Ave, Apt 14F', city: 'New York', state: 'NY', zip: '10022', email: 'dkaplan@kaplanventures.com', status: 'prospect', tags: ['warm-prospect'], source: 'Website', notes: 'Filled out the contact form. Software entrepreneur. Looking for tax-deductible giving.' },
  { first: 'Ephraim', last: 'Wassermann', hebrew: 'אפרים וסרמן', street: '76 Oakland Ave', city: 'Spring Valley', state: 'NY', zip: '10977', email: 'ewassermann@gmail.com', status: 'prospect', source: 'Annual dinner', notes: 'Sat at table 12 at the dinner. Chaim recommended following up.' },
  { first: 'Gavriel', last: 'Hirsch', hebrew: 'גבריאל הירש', street: '32 Wall St', city: 'New York', state: 'NY', zip: '10005', email: 'ghirsch@hirschcapital.com', org: 'Hirsch Capital Partners', occupation: 'Investment Banker', status: 'prospect', tags: ['major-prospect'], source: 'Referral - Rabbi Cohen' },
  { first: 'Hillel', last: 'Lazarus', hebrew: 'הלל לזרוס', street: '88 Concord Lane', city: 'Lakewood', state: 'NJ', zip: '08701', status: 'prospect', source: 'Friend of Yeshiva' },
  { first: 'Yisrael', last: 'Mandelbaum', hebrew: 'ישראל מנדלבוים', occupation: 'Furniture Importer', street: '12 New Hempstead Rd', city: 'New City', state: 'NY', zip: '10956', email: 'imandelbaum@mandelfurniture.com', status: 'prospect', source: 'Wedding Sheva Brachos' },
  { first: 'Rafael', last: 'Steinberg', hebrew: 'רפאל שטיינברג', occupation: 'Dentist', street: '425 Avenue R', city: 'Brooklyn', state: 'NY', zip: '11223', email: 'rsteinberg@bkdental.com', status: 'prospect', source: 'Cold call', notes: 'Mentioned he gives smaller amounts. Testing the relationship first.' },

  // ===== Special - lapsed / DNC =====
  { first: 'Lapsed', last: 'Donor', hebrew: 'תורם ישן', street: '99 Old St', city: 'Brooklyn', state: 'NY', zip: '11201', status: 'donor', source: 'Old donor list', notes: 'Stopped giving 3 years ago. Haven\'t followed up.' },
];

const FOLLOWUP_TEMPLATES = [
  { offsetDays: 1, title: 'Thank-you call', kind: 'call', priority: 'high' },
  { offsetDays: 3, title: 'Send pledge agreement', kind: 'task', priority: 'normal' },
  { offsetDays: 5, title: 'Schedule yeshiva tour', kind: 'meeting', priority: 'normal' },
  { offsetDays: 7, title: 'Follow-up after Pesach', kind: 'call', priority: 'low' },
  { offsetDays: 10, title: 'Check in re: pending check', kind: 'call', priority: 'high' },
  { offsetDays: 14, title: 'Send progress update', kind: 'email', priority: 'normal' },
  { offsetDays: 21, title: 'Birthday call', kind: 'call', priority: 'normal' },
  { offsetDays: -2, title: 'Confirm gala attendance', kind: 'task', priority: 'high' },
  { offsetDays: -5, title: 'Request introduction to friend', kind: 'meeting', priority: 'low' },
];

const CALL_SUMMARIES = [
  { summary: 'Brief catch-up call. Family is well. Asked about progress on the building. Sent latest brochure.', outcome: 'Engaged', direction: 'outbound', channel: 'phone' },
  { summary: 'Discussed his pledge schedule. Confirmed next check coming next week. Wife sends her regards.', outcome: 'Confirmed', direction: 'outbound', channel: 'phone' },
  { summary: 'He called us to ask about the dinner. Confirmed table reservation for 8 people. Will bring son-in-law.', outcome: 'Will attend dinner', direction: 'inbound', channel: 'phone' },
  { summary: 'Long meeting at his office. Reviewed building plans. He committed verbally to additional $25K.', outcome: 'Verbal commitment', direction: 'outbound', channel: 'meeting' },
  { summary: 'Quick text exchange. Confirmed wire was sent yesterday. Receipt requested.', outcome: 'Payment confirmed', direction: 'inbound', channel: 'text' },
  { summary: 'No answer. Left voicemail asking him to call back at his convenience.', outcome: 'No answer', direction: 'outbound', channel: 'phone' },
];

const NOTES_POOL = [
  'Loves Sephardic music. Mentions it every time.',
  'Daughter just got engaged — send mazal tov gift.',
  'Hates phone calls before 10 AM.',
  'Allergic to gluten — remember for events.',
  'His grandfather was the Bostoner Rebbe\'s gabbai.',
  'Speaks Yiddish at home. Send Yiddish materials when possible.',
  'Strong relationship with our menahel — keep him in the loop.',
  'Prefers to be called "Reb" not "Mr."',
  'Has 8 grandchildren — asks about them by name.',
  'Wife is more involved than he is. Cc her on emails.',
];

function isoMinusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface Statement {
  sql: string;
  args: (string | number | null)[];
}

export async function POST() {
  const session = await getFundraisingSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!session.isManager) return NextResponse.json({ error: 'Only managers can seed demo data' }, { status: 403 });
  await dbReady();

  // 1. Ensure projects exist (or fetch existing ones)
  let annualId: string | null = null;
  let buildingId: string | null = null;
  let generalId: string | null = null;

  const existingProjects = await db().execute({
    sql: 'SELECT id, name FROM fr_projects WHERE owner_id = ?',
    args: [session.ownerId],
  });

  for (const p of existingProjects.rows) {
    const name = String(p.name).toLowerCase();
    if (name.includes('annual') && !annualId) annualId = String(p.id);
    if (name.includes('building') && !buildingId) buildingId = String(p.id);
    if (name.includes('general') && !generalId) generalId = String(p.id);
  }

  const projectsToCreate: Statement[] = [];
  if (!annualId) {
    annualId = crypto.randomUUID();
    projectsToCreate.push({
      sql: 'INSERT INTO fr_projects (id, owner_id, name, description, goal_amount, status) VALUES (?, ?, ?, ?, ?, ?)',
      args: [annualId, session.ownerId, 'Annual Campaign 5786', 'Yearly fundraising for general operations', 500000, 'active'],
    });
  }
  if (!buildingId) {
    buildingId = crypto.randomUUID();
    projectsToCreate.push({
      sql: 'INSERT INTO fr_projects (id, owner_id, name, description, goal_amount, status) VALUES (?, ?, ?, ?, ?, ?)',
      args: [buildingId, session.ownerId, 'New Beis Medrash Building Fund', 'Construction of expanded beis medrash and dormitory', 5000000, 'active'],
    });
  }
  if (!generalId) {
    generalId = crypto.randomUUID();
    projectsToCreate.push({
      sql: 'INSERT INTO fr_projects (id, owner_id, name, description, goal_amount, status) VALUES (?, ?, ?, ?, ?, ?)',
      args: [generalId, session.ownerId, 'Kemach Fund', 'Food, scholarships, and stipends for talmidim', 200000, 'active'],
    });
  }
  if (projectsToCreate.length > 0) await db().batch(projectsToCreate, 'write');

  const projectMap: Record<'annual' | 'building' | 'general', string> = { annual: annualId, building: buildingId, general: generalId };

  // 2. Sources
  const existingSources = await db().execute({
    sql: 'SELECT id, name FROM fr_sources WHERE owner_id = ?',
    args: [session.ownerId],
  });
  const sourceMap: Record<string, string> = {};
  for (const s of existingSources.rows) sourceMap[String(s.name)] = String(s.id);

  const sourceCreates: Statement[] = [];
  for (const name of SOURCES) {
    if (!sourceMap[name]) {
      const id = crypto.randomUUID();
      sourceMap[name] = id;
      sourceCreates.push({
        sql: 'INSERT INTO fr_sources (id, owner_id, name) VALUES (?, ?, ?)',
        args: [id, session.ownerId, name],
      });
    }
  }
  if (sourceCreates.length > 0) await db().batch(sourceCreates, 'write');

  // 3. Donors + their phones, addresses, calls, notes, pledges, payments, followups
  const stats = { donors: 0, prospects: 0, pledges: 0, payments: 0, paidPayments: 0, calls: 0, notes: 0, followups: 0 };
  const created: { donorId: string; pledgeIds: string[] }[] = [];

  for (let idx = 0; idx < FAKE_DONORS.length; idx++) {
    const fd = FAKE_DONORS[idx];
    const donorId = crypto.randomUUID();
    const stmts: Statement[] = [];

    const createdAt = isoMinusDays(180 - idx * 4); // spread over 6 months
    const isDonor = fd.status === 'donor';
    if (isDonor) stats.donors++;
    else stats.prospects++;

    stmts.push({
      sql: `INSERT INTO fr_donors
              (id, owner_id, status, first_name, last_name, hebrew_name, title, spouse_name,
               email, organization, occupation, birthday, anniversary, yahrzeit,
               tags, source_id, preferred_contact, notes, created_at, converted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        donorId,
        session.ownerId,
        fd.status,
        fd.first,
        fd.last,
        fd.hebrew || null,
        fd.title || null,
        fd.spouse || null,
        fd.email || null,
        fd.org || null,
        fd.occupation || null,
        fd.birthday || null,
        fd.anniversary || null,
        fd.yahrzeit || null,
        JSON.stringify(fd.tags || []),
        fd.source ? sourceMap[fd.source] : null,
        fd.preferredContact || 'phone',
        fd.notes || null,
        createdAt,
        isDonor ? createdAt : null,
      ],
    });

    // Phones — primary + sometimes secondary
    const areaPrefixMap: Record<string, string> = { Brooklyn: '347', 'New York': '212', Lakewood: '732', Monsey: '845', Lawrence: '516', Cedarhurst: '516', Teaneck: '201', 'Far Rockaway': '347', Passaic: '973', 'Spring Valley': '845', 'New City': '845' };
    const area = areaPrefixMap[fd.city] || '917';
    const lineNum = String(1000000 + Math.floor(Math.random() * 9000000));
    const phone1 = `+1-${area}-${lineNum.slice(0, 3)}-${lineNum.slice(3)}`;
    stmts.push({
      sql: 'INSERT INTO fr_donor_phones (id, donor_id, label, phone, is_primary, sort_order) VALUES (?, ?, ?, ?, 1, 0)',
      args: [crypto.randomUUID(), donorId, 'mobile', phone1],
    });
    if (fd.org && Math.random() > 0.4) {
      const officeNum = String(2000000 + Math.floor(Math.random() * 9000000));
      stmts.push({
        sql: 'INSERT INTO fr_donor_phones (id, donor_id, label, phone, is_primary, sort_order) VALUES (?, ?, ?, ?, 0, 1)',
        args: [crypto.randomUUID(), donorId, 'office', `+1-${area}-${officeNum.slice(0, 3)}-${officeNum.slice(3)}`],
      });
    }

    // Addresses
    stmts.push({
      sql: `INSERT INTO fr_donor_addresses
              (id, donor_id, label, street, city, state, zip, country, is_reception, is_primary, sort_order)
            VALUES (?, ?, 'home', ?, ?, ?, ?, 'USA', ?, 1, 0)`,
      args: [crypto.randomUUID(), donorId, fd.street, fd.city, fd.state, fd.zip, isDonor ? 1 : 0],
    });

    // Calls — donors only
    if (isDonor) {
      const numCalls = 1 + Math.floor(Math.random() * 3);
      for (let c = 0; c < numCalls; c++) {
        const callTpl = pickRandom(CALL_SUMMARIES);
        const callDate = new Date();
        callDate.setDate(callDate.getDate() - (3 + c * 7 + Math.floor(Math.random() * 5)));
        stmts.push({
          sql: `INSERT INTO fr_calls
                  (id, owner_id, donor_id, fundraiser_id, project_id, direction, channel, occurred_at,
                   duration_min, outcome, summary, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            crypto.randomUUID(),
            session.ownerId,
            donorId,
            null,
            null,
            callTpl.direction,
            callTpl.channel,
            callDate.toISOString(),
            5 + Math.floor(Math.random() * 30),
            callTpl.outcome,
            callTpl.summary,
            session.actorId,
          ],
        });
        stats.calls++;
      }
      // Update last_contact_at
      stmts.push({
        sql: `UPDATE fr_donors SET last_contact_at = (SELECT MAX(occurred_at) FROM fr_calls WHERE donor_id = ?) WHERE id = ?`,
        args: [donorId, donorId],
      });
    }

    // Notes — random
    if (Math.random() > 0.5) {
      stmts.push({
        sql: 'INSERT INTO fr_notes (id, donor_id, author_type, author_id, author_name, body, pinned) VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [crypto.randomUUID(), donorId, 'manager', session.actorId, session.name, pickRandom(NOTES_POOL), Math.random() > 0.7 ? 1 : 0],
      });
      stats.notes++;
    }

    // Pledges + payments
    const pledgeIds: string[] = [];
    if (fd.pledgeAmount && fd.pledgePlan && fd.pledgeInstallments) {
      const pledgeId = crypto.randomUUID();
      pledgeIds.push(pledgeId);
      stats.pledges++;

      const pledgeDate = isoMinusDays(150 - idx * 3);
      const projectId = projectMap[fd.pledgeProject || 'annual'];
      stmts.push({
        sql: `INSERT INTO fr_pledges
                (id, owner_id, donor_id, project_id, fundraiser_id, amount, currency, status,
                 pledge_date, installments_total, payment_plan, notes)
              VALUES (?, ?, ?, ?, ?, ?, 'USD', 'open', ?, ?, ?, ?)`,
        args: [
          pledgeId,
          session.ownerId,
          donorId,
          projectId,
          null,
          fd.pledgeAmount,
          pledgeDate,
          fd.pledgeInstallments,
          fd.pledgePlan,
          null,
        ],
      });

      const dates = generateInstallmentDates(pledgeDate, fd.pledgeInstallments, fd.pledgePlan);
      const baseAmt = Math.floor((fd.pledgeAmount * 100) / fd.pledgeInstallments) / 100;
      const remainder = Math.round((fd.pledgeAmount - baseAmt * fd.pledgeInstallments) * 100) / 100;
      const paid = Math.min(fd.paidInstallments || 0, fd.pledgeInstallments);

      for (let i = 0; i < fd.pledgeInstallments; i++) {
        const amt = i === 0 ? baseAmt + remainder : baseAmt;
        const isPaid = i < paid;
        const isBouncedFirst = fd.bouncedFirst && i === 0;
        let status: string = 'scheduled';
        let paidDate: string | null = null;
        if (isBouncedFirst) {
          status = 'bounced';
        } else if (isPaid) {
          status = 'paid';
          paidDate = dates[i];
          stats.paidPayments++;
        }
        const paymentId = crypto.randomUUID();
        const checkNum = fd.pledgeMethod === 'check' ? `${1000 + idx * 50 + i}` : null;
        const cc4 = fd.pledgeMethod === 'credit_card' ? String(4000 + idx * 17 + i).slice(-4) : null;

        stmts.push({
          sql: `INSERT INTO fr_pledge_payments
                  (id, pledge_id, donor_id, project_id, installment_number, method, amount, currency,
                   due_date, paid_date, status, check_number, bank_name, cc_last4)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, ?, ?)`,
          args: [
            paymentId,
            pledgeId,
            donorId,
            projectId,
            i + 1,
            fd.pledgeMethod || 'credit_card',
            amt,
            dates[i],
            paidDate,
            status,
            checkNum,
            checkNum ? 'Chase Bank' : null,
            cc4,
          ],
        });
        stats.payments++;
      }
    }

    // One-time donation
    if (fd.oneTimeDonation && fd.oneTimeMethod) {
      const oneShotPledgeId = crypto.randomUUID();
      const oneShotPaymentId = crypto.randomUUID();
      const date = isoMinusDays(30 + idx * 5);
      const projectId = projectMap[fd.oneTimeProject || 'general'];

      stmts.push({
        sql: `INSERT INTO fr_pledges (id, owner_id, donor_id, project_id, fundraiser_id, amount, currency, status, pledge_date, installments_total, payment_plan)
              VALUES (?, ?, ?, ?, ?, ?, 'USD', 'fulfilled', ?, 1, 'lump_sum')`,
        args: [oneShotPledgeId, session.ownerId, donorId, projectId, null, fd.oneTimeDonation, date],
      });
      stmts.push({
        sql: `INSERT INTO fr_pledge_payments
                (id, pledge_id, donor_id, project_id, installment_number, method, amount, currency,
                 due_date, paid_date, status)
              VALUES (?, ?, ?, ?, 1, ?, ?, 'USD', ?, ?, 'paid')`,
        args: [oneShotPaymentId, oneShotPledgeId, donorId, projectId, fd.oneTimeMethod, fd.oneTimeDonation, date, date],
      });
      pledgeIds.push(oneShotPledgeId);
      stats.pledges++;
      stats.payments++;
      stats.paidPayments++;
    }

    // Follow-ups — randomly schedule 1-2 per donor
    const numFollowups = Math.random() > 0.6 ? 2 : Math.random() > 0.3 ? 1 : 0;
    const usedTemplates = new Set<number>();
    for (let f = 0; f < numFollowups; f++) {
      let tplIdx = Math.floor(Math.random() * FOLLOWUP_TEMPLATES.length);
      while (usedTemplates.has(tplIdx)) tplIdx = (tplIdx + 1) % FOLLOWUP_TEMPLATES.length;
      usedTemplates.add(tplIdx);
      const tpl = FOLLOWUP_TEMPLATES[tplIdx];
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + tpl.offsetDays);
      dueDate.setHours(9 + Math.floor(Math.random() * 8), Math.random() > 0.5 ? 30 : 0, 0, 0);
      stmts.push({
        sql: `INSERT INTO fr_followups
                (id, owner_id, donor_id, fundraiser_id, title, due_at, kind, priority, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          crypto.randomUUID(),
          session.ownerId,
          donorId,
          null,
          tpl.title,
          dueDate.toISOString(),
          tpl.kind,
          tpl.priority,
          tpl.offsetDays < 0 ? (Math.random() > 0.5 ? 'done' : 'pending') : 'pending',
        ],
      });
      stats.followups++;
    }

    // Update next_followup_at
    stmts.push({
      sql: `UPDATE fr_donors SET next_followup_at = (SELECT MIN(due_at) FROM fr_followups WHERE donor_id = ? AND status = 'pending') WHERE id = ?`,
      args: [donorId, donorId],
    });

    // Execute all statements for this donor in one batch
    await db().batch(stmts, 'write');
    created.push({ donorId, pledgeIds });
  }

  // Recompute donor totals in parallel. Pledge statuses are already correct from inserts.
  await Promise.all(created.map((c) => recomputeDonorTotals(c.donorId)));

  return NextResponse.json({ ok: true, ...stats });
}
