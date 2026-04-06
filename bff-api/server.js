import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const { Pool } = pg;
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('../frontend'));

// Database connection credentials
const pool = new Pool({
  user: 'saikumararigonda',
  host: 'localhost',
  database: 'SaiTech_Production_DB',
  port: 5432,
  password: '', // Leave empty for local Homebrew setup
});

// 1. Initial Database Handshake (Check terminal for this log)
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database Connection Error:', err.stack);
  } else {
    console.log('✅ Database Handshake Successful:', res.rows[0].now);
  }
});

// 2. Status Route
app.get('/api/status', (_req, res) => {
  res.json({ status: 'BFF is Online', database: 'Connected' });
});

// 3. Health Check Route
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'healthy', database: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

// 4. Fetch Clients Route (The Data Bridge)
app.get('/api/clients', async (_req, res) => {
  try {
    // IMPORTANT: Note the table/column names from our 'pk_' architecture
    const result = await pool.query('SELECT * FROM clients');
    res.json(result.rows);
  } catch (err) {
    console.error('Database Error:', err.message);
    res.status(500).json({ error: 'Database connection failed' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Sai Tech BFF running at http://localhost:${port}`);
  console.log(`📱 On same WiFi, open: http://192.168.1.2:${port}/student.html`);
});
// Summary Statistics (enhanced with paidRevenue + overdueCount)
app.get('/api/stats', async (_req, res) => {
  try {
    const clientCount = await pool.query('SELECT COUNT(*) FROM clients');
    const projectCount = await pool.query("SELECT COUNT(*) FROM projects WHERE status = 'Active'");
    const pendingSum = await pool.query("SELECT SUM(billed_amount) FROM invoices WHERE payment_status = 'Pending'");
    const paidSum = await pool.query("SELECT SUM(billed_amount) FROM invoices WHERE payment_status = 'Paid'");
    const overdueCount = await pool.query("SELECT COUNT(*) FROM invoices WHERE payment_status = 'Overdue'");

    res.json({
      clients: clientCount.rows[0].count,
      activeProjects: projectCount.rows[0].count,
      pendingRevenue: pendingSum.rows[0].sum || 0,
      paidRevenue: paidSum.rows[0].sum || 0,
      overdueCount: overdueCount.rows[0].count,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Projects Route
app.get('/api/projects', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM projects ORDER BY status');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Invoices Route (most recent 10)
app.get('/api/invoices', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM invoices ORDER BY created_at DESC LIMIT 10');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Region Status Route
app.get('/api/region-status', (_req, res) => {
  res.json([
    { region: 'us-east-1',  label: 'US East',  flag: '🇺🇸', latency: 12,  status: 'online' },
    { region: 'us-west-2',  label: 'US West',  flag: '🇺🇸', latency: 47,  status: 'online' },
    { region: 'eu-west-1',  label: 'EU West',  flag: '🇪🇺', latency: 91,  status: 'online' },
    { region: 'ap-south-1', label: 'AP South', flag: '🇮🇳', latency: 138, status: 'online' },
  ]);
});

// ─── Student App: DB Init + Seeding ──────────────────────────────────────────

async function initStudentDB() {
  await pool.query(`CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL, pin VARCHAR(4) NOT NULL,
    grade INTEGER DEFAULT 2, created_at TIMESTAMP DEFAULT NOW()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS questions (
    id SERIAL PRIMARY KEY, topic VARCHAR(20), question_type VARCHAR(20),
    question_text TEXT, visual_data JSONB, options JSONB,
    correct_answer TEXT, difficulty INTEGER DEFAULT 1
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY, student_id INTEGER REFERENCES students(id),
    topic VARCHAR(20), date DATE DEFAULT CURRENT_DATE,
    started_at TIMESTAMP DEFAULT NOW(), ended_at TIMESTAMP,
    time_spent_secs INTEGER DEFAULT 0, score INTEGER DEFAULT 0,
    total_questions INTEGER DEFAULT 0, completed BOOLEAN DEFAULT FALSE
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS session_answers (
    id SERIAL PRIMARY KEY, session_id INTEGER REFERENCES sessions(id),
    question_id INTEGER REFERENCES questions(id), answer_given TEXT,
    correct_answer TEXT, is_correct BOOLEAN, time_spent_secs INTEGER DEFAULT 0,
    answered_at TIMESTAMP DEFAULT NOW()
  )`);
  const { rows } = await pool.query('SELECT COUNT(*) FROM questions');
  if (parseInt(rows[0].count) === 0) await seedQuestions();

  // Expand time questions if below target (handles first run or upgrades)
  const timeRows = await pool.query("SELECT COUNT(*) FROM questions WHERE topic='time'");
  if (parseInt(timeRows.rows[0].count) < 50) {
    await pool.query('DELETE FROM session_answers WHERE question_id IN (SELECT id FROM questions WHERE topic=$1)', ['time']);
    await pool.query("DELETE FROM questions WHERE topic='time'");
    await seedTimeQuestions();
  }

  console.log('✅ Student DB initialized');
}

async function seedQuestions() {
  const qs = [
    // Time
    ['time','clock','What time does the clock show?',{hours:3,minutes:0},['3:00','2:00','3:30','4:00'],'3:00'],
    ['time','clock','What time does the clock show?',{hours:6,minutes:30},['6:00','6:30','7:00','5:30'],'6:30'],
    ['time','clock','What time does the clock show?',{hours:1,minutes:15},['1:00','1:15','1:30','2:15'],'1:15'],
    ['time','clock','What time does the clock show?',{hours:9,minutes:0},['9:00','3:00','9:15','8:00'],'9:00'],
    ['time','clock','What time does the clock show?',{hours:12,minutes:0},['12:00','12:30','6:00','11:00'],'12:00'],
    ['time','clock','What time does the clock show?',{hours:4,minutes:30},['4:30','5:00','4:15','3:30'],'4:30'],
    ['time','clock','What time does the clock show?',{hours:7,minutes:0},['7:30','7:00','6:30','8:00'],'7:00'],
    ['time','clock','What time does the clock show?',{hours:2,minutes:45},['2:45','2:00','3:45','2:30'],'2:45'],
    // Calendar
    ['calendar','multiple_choice','What day of the week is April 1, 2026?',{month:4,year:2026,highlight:1},['Monday','Tuesday','Wednesday','Thursday'],'Wednesday'],
    ['calendar','multiple_choice','How many days are in a week?',null,['5','6','7','8'],'7'],
    ['calendar','multiple_choice','What day comes after Wednesday?',null,['Monday','Tuesday','Thursday','Friday'],'Thursday'],
    ['calendar','multiple_choice','What is the 4th month of the year?',null,['March','April','May','June'],'April'],
    ['calendar','multiple_choice','How many Sundays are in April 2026?',{month:4,year:2026,highlight:null},['3','4','5','6'],'4'],
    ['calendar','multiple_choice','What day comes before Friday?',null,['Wednesday','Thursday','Saturday','Monday'],'Thursday'],
    ['calendar','multiple_choice','How many months are in a year?',null,['10','11','12','13'],'12'],
    ['calendar','multiple_choice','What month comes after March?',null,['February','April','May','June'],'April'],
    // Money
    ['money','coins','How much money is shown?',{coins:[{type:'quarter',count:1}]},['20¢','25¢','30¢','50¢'],'25¢'],
    ['money','coins','How much money is shown?',{coins:[{type:'dime',count:2}]},['10¢','15¢','20¢','25¢'],'20¢'],
    ['money','coins','How much money is shown?',{coins:[{type:'quarter',count:1},{type:'dime',count:1}]},['30¢','35¢','40¢','45¢'],'35¢'],
    ['money','coins','How much money is shown?',{coins:[{type:'nickel',count:3}]},['10¢','15¢','20¢','25¢'],'15¢'],
    ['money','coins','How much money is shown?',{coins:[{type:'quarter',count:2}]},['25¢','50¢','75¢','$1.00'],'50¢'],
    ['money','coins','How much money is shown?',{coins:[{type:'quarter',count:1},{type:'nickel',count:2}]},['30¢','35¢','40¢','45¢'],'35¢'],
    ['money','coins','How much money is shown?',{coins:[{type:'penny',count:4}]},['1¢','2¢','4¢','5¢'],'4¢'],
    ['money','coins','How much money is shown?',{coins:[{type:'dime',count:1},{type:'nickel',count:1}]},['10¢','15¢','20¢','25¢'],'15¢'],
  ];
  for (const [topic, type, text, visual, options, answer] of qs) {
    await pool.query(
      'INSERT INTO questions (topic, question_type, question_text, visual_data, options, correct_answer) VALUES ($1,$2,$3,$4,$5,$6)',
      [topic, type, text, JSON.stringify(visual), JSON.stringify(options), answer]
    );
  }
  console.log('✅ 24 questions seeded');
}

async function seedTimeQuestions() {
  const qs = [
    // ── Whole Hours ──
    ['clock','What time does the clock show?',{hours:1,minutes:0}, ['1:00','2:00','1:30','12:00'],'1:00'],
    ['clock','What time does the clock show?',{hours:5,minutes:0}, ['5:00','6:00','5:30','4:00'],'5:00'],
    ['clock','What time does the clock show?',{hours:8,minutes:0}, ['7:00','8:00','8:30','9:00'],'8:00'],
    ['clock','What time does the clock show?',{hours:10,minutes:0},['10:00','11:00','9:00','10:30'],'10:00'],
    ['clock','What time does the clock show?',{hours:11,minutes:0},['10:00','11:30','11:00','12:00'],'11:00'],
    ['clock','What time does the clock show?',{hours:6,minutes:0}, ['5:30','6:00','6:30','7:00'],'6:00'],
    ['clock','What time does the clock show?',{hours:3,minutes:0}, ['2:30','3:00','3:30','4:00'],'3:00'],
    ['clock','What time does the clock show?',{hours:9,minutes:0}, ['9:00','3:00','9:15','8:00'],'9:00'],
    ['clock','What time does the clock show?',{hours:12,minutes:0},['12:00','12:30','6:00','11:00'],'12:00'],
    // ── Half Hours ──
    ['clock','What time does the clock show?',{hours:1,minutes:30}, ['1:00','1:30','2:00','2:30'],'1:30'],
    ['clock','What time does the clock show?',{hours:3,minutes:30}, ['3:00','3:30','4:00','4:30'],'3:30'],
    ['clock','What time does the clock show?',{hours:5,minutes:30}, ['5:00','5:30','6:00','6:30'],'5:30'],
    ['clock','What time does the clock show?',{hours:6,minutes:30}, ['6:00','6:30','7:00','5:30'],'6:30'],
    ['clock','What time does the clock show?',{hours:8,minutes:30}, ['8:00','8:30','9:00','9:30'],'8:30'],
    ['clock','What time does the clock show?',{hours:10,minutes:30},['10:00','10:30','11:00','11:30'],'10:30'],
    ['clock','What time does the clock show?',{hours:11,minutes:30},['11:00','11:30','12:00','12:30'],'11:30'],
    // ── Quarter Hours ──
    ['clock','What time does the clock show?',{hours:1,minutes:15}, ['1:00','1:15','1:30','2:15'],'1:15'],
    ['clock','What time does the clock show?',{hours:2,minutes:15}, ['2:00','2:15','2:30','2:45'],'2:15'],
    ['clock','What time does the clock show?',{hours:4,minutes:15}, ['4:00','4:15','4:30','5:15'],'4:15'],
    ['clock','What time does the clock show?',{hours:7,minutes:15}, ['6:45','7:00','7:15','7:30'],'7:15'],
    ['clock','What time does the clock show?',{hours:10,minutes:15},['9:45','10:00','10:15','10:30'],'10:15'],
    ['clock','What time does the clock show?',{hours:2,minutes:45}, ['2:15','2:30','2:45','3:00'],'2:45'],
    ['clock','What time does the clock show?',{hours:3,minutes:45}, ['3:15','3:30','3:45','4:00'],'3:45'],
    ['clock','What time does the clock show?',{hours:4,minutes:30}, ['4:30','5:00','4:15','3:30'],'4:30'],
    ['clock','What time does the clock show?',{hours:6,minutes:45}, ['6:15','6:30','6:45','7:00'],'6:45'],
    ['clock','What time does the clock show?',{hours:8,minutes:45}, ['8:15','8:30','8:45','9:00'],'8:45'],
    ['clock','What time does the clock show?',{hours:5,minutes:45}, ['5:15','5:30','5:45','6:00'],'5:45'],
    // ── 5-Minute Intervals ──
    ['clock','What time does the clock show?',{hours:1,minutes:5},  ['1:00','1:05','1:10','1:15'],'1:05'],
    ['clock','What time does the clock show?',{hours:2,minutes:10}, ['2:00','2:05','2:10','2:15'],'2:10'],
    ['clock','What time does the clock show?',{hours:3,minutes:20}, ['3:15','3:20','3:25','3:30'],'3:20'],
    ['clock','What time does the clock show?',{hours:4,minutes:25}, ['4:20','4:25','4:30','4:35'],'4:25'],
    ['clock','What time does the clock show?',{hours:5,minutes:35}, ['5:30','5:35','5:40','5:45'],'5:35'],
    ['clock','What time does the clock show?',{hours:6,minutes:40}, ['6:35','6:40','6:45','6:50'],'6:40'],
    ['clock','What time does the clock show?',{hours:7,minutes:50}, ['7:45','7:50','7:55','8:00'],'7:50'],
    ['clock','What time does the clock show?',{hours:7,minutes:0},  ['7:30','7:00','6:30','8:00'],'7:00'],
    ['clock','What time does the clock show?',{hours:8,minutes:55}, ['8:50','8:55','9:00','9:05'],'8:55'],
    // ── Match the Time (clock_match) ──
    ['clock_match','Which clock shows 3:30?', {display_time:'3:30', clock_options:[{h:3,m:30},{h:3,m:0},{h:6,m:15},{h:4,m:30}]},['3:30','3:00','6:15','4:30'],'3:30'],
    ['clock_match','Which clock shows 9:15?', {display_time:'9:15', clock_options:[{h:9,m:0},{h:9,m:15},{h:9,m:30},{h:3,m:15}]},['9:00','9:15','9:30','3:15'],'9:15'],
    ['clock_match','Which clock shows 6:00?', {display_time:'6:00', clock_options:[{h:6,m:0},{h:6,m:30},{h:12,m:0},{h:3,m:0}]},['6:00','6:30','12:00','3:00'],'6:00'],
    ['clock_match','Which clock shows 1:45?', {display_time:'1:45', clock_options:[{h:1,m:15},{h:1,m:30},{h:1,m:45},{h:2,m:15}]},['1:15','1:30','1:45','2:15'],'1:45'],
    ['clock_match','Which clock shows 11:30?',{display_time:'11:30',clock_options:[{h:11,m:0},{h:11,m:30},{h:12,m:30},{h:10,m:30}]},['11:00','11:30','12:30','10:30'],'11:30'],
    ['clock_match','Which clock shows 4:20?', {display_time:'4:20', clock_options:[{h:4,m:10},{h:4,m:20},{h:4,m:25},{h:5,m:20}]},['4:10','4:20','4:25','5:20'],'4:20'],
    // ── AM / PM ──
    ['multiple_choice','You eat breakfast at 7:30. Is it AM or PM?',                   null,['AM','PM'],'AM'],
    ['multiple_choice','You go to bed at 9:00 at night. Is it AM or PM?',              null,['AM','PM'],'PM'],
    ['multiple_choice','School starts at 8:15 in the morning. Is it AM or PM?',        null,['AM','PM'],'AM'],
    ['multiple_choice','You eat dinner at 6:00 in the evening. Is it AM or PM?',       null,['AM','PM'],'PM'],
    ['multiple_choice','You wake up at 7:00 in the morning. Is it AM or PM?',          null,['AM','PM'],'AM'],
    ['multiple_choice','Soccer practice ends at 5:30 in the afternoon. Is it AM or PM?',null,['AM','PM'],'PM'],
    // ── Elapsed Time ──
    ['multiple_choice','School starts at 8:00 AM and lunch is at 12:00 PM. How many hours is that?',null,['2 hours','3 hours','4 hours','5 hours'],'4 hours'],
    ['multiple_choice','It is 2:00 PM. Soccer practice is in 2 hours. What time does it start?',   null,['3:00 PM','4:00 PM','5:00 PM','6:00 PM'],'4:00 PM'],
    ['multiple_choice','You start reading at 1:00 PM and stop at 1:30 PM. How long did you read?', null,['15 minutes','30 minutes','45 minutes','1 hour'],'30 minutes'],
    ['multiple_choice','The movie starts at 3:00 PM and is 2 hours long. What time does it end?',  null,['4:00 PM','5:00 PM','6:00 PM','7:00 PM'],'5:00 PM'],
    ['multiple_choice','It is 9:00 AM. Recess is in 1 hour and 30 minutes. What time is recess?',  null,['9:30 AM','10:00 AM','10:30 AM','11:00 AM'],'10:30 AM'],
    ['multiple_choice','Dinner starts at 6:00 PM and takes 30 minutes. What time does it end?',    null,['6:15 PM','6:30 PM','6:45 PM','7:00 PM'],'6:30 PM'],
    // ── Word Problems ──
    ["multiple_choice","Jenny's dance class starts at 4:00 PM and lasts 1 hour. What time does it end?",null,['4:30 PM','5:00 PM','5:30 PM','6:00 PM'],'5:00 PM'],
    ['multiple_choice','It is 10:00 AM. Lunch is in 2 hours. What time is lunch?',                null,['11:00 AM','12:00 PM','1:00 PM','2:00 PM'],'12:00 PM'],
    ['multiple_choice','Tom goes to the park at 3:30 PM and plays for 1 hour. What time does he go home?',null,['4:00 PM','4:30 PM','5:00 PM','5:30 PM'],'4:30 PM'],
    ['multiple_choice','A TV show starts at 7:00 PM and is 30 minutes long. What time does it end?',null,['7:15 PM','7:30 PM','7:45 PM','8:00 PM'],'7:30 PM'],
    ['multiple_choice','Math class starts at 9:00 AM and lasts 45 minutes. What time does it end?',null,['9:30 AM','9:45 AM','10:00 AM','10:15 AM'],'9:45 AM'],
  ];
  for (const [type, text, visual, options, answer] of qs) {
    await pool.query(
      'INSERT INTO questions (topic, question_type, question_text, visual_data, options, correct_answer) VALUES ($1,$2,$3,$4,$5,$6)',
      ['time', type, text, JSON.stringify(visual), JSON.stringify(options), answer]
    );
  }
  console.log(`✅ ${qs.length} time questions seeded`);
}

initStudentDB().catch(err => console.error('❌ Student DB init error:', err));

// ─── Student Routes ───────────────────────────────────────────────────────────

app.get('/api/student/list', async (_req, res) => {
  try {
    const r = await pool.query('SELECT id, name FROM students ORDER BY name');
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/student/login', async (req, res) => {
  const { studentId, pin } = req.body;
  try {
    const r = await pool.query('SELECT id, name FROM students WHERE id=$1 AND pin=$2', [studentId, pin]);
    if (!r.rows.length) return res.status(401).json({ error: 'Wrong PIN. Try again!' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/student/register', async (req, res) => {
  const { name, pin, teacherPassword } = req.body;
  if (teacherPassword !== (process.env.TEACHER_PASSWORD || 'teacher123'))
    return res.status(401).json({ error: 'Invalid teacher password' });
  try {
    const r = await pool.query('INSERT INTO students (name, pin) VALUES ($1,$2) RETURNING id, name', [name, pin]);
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/student/dashboard', async (req, res) => {
  const { studentId } = req.query;
  try {
    const st = await pool.query('SELECT name FROM students WHERE id=$1', [studentId]);
    const sessions = await pool.query(
      `SELECT DISTINCT ON (topic) topic, score, total_questions, completed
       FROM sessions WHERE student_id=$1 AND date=CURRENT_DATE
       ORDER BY topic, id DESC`, [studentId]
    );
    const topics = ['time','calendar','money'].map(topic => {
      const s = sessions.rows.find(r => r.topic === topic);
      const total = s?.total_questions || 5;
      const score = s?.score || 0;
      return { topic, completed: s?.completed || false, score, total,
        stars: s ? Math.round((score / total) * 5) : 0 };
    });
    res.json({ name: st.rows[0]?.name, topics });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/student/questions', async (req, res) => {
  const { studentId, topic } = req.query;
  try {
    const session = await pool.query(
      'INSERT INTO sessions (student_id, topic) VALUES ($1,$2) RETURNING id', [studentId, topic]
    );
    const questions = await pool.query(
      'SELECT id, question_text, question_type, visual_data, options, correct_answer FROM questions WHERE topic=$1 ORDER BY RANDOM() LIMIT 5', [topic]
    );
    res.json({ sessionId: session.rows[0].id, questions: questions.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/student/answer', async (req, res) => {
  const { sessionId, questionId, answerGiven, isCorrect, timeSpentSecs } = req.body;
  try {
    const q = await pool.query('SELECT correct_answer FROM questions WHERE id=$1', [questionId]);
    await pool.query(
      'INSERT INTO session_answers (session_id, question_id, answer_given, correct_answer, is_correct, time_spent_secs) VALUES ($1,$2,$3,$4,$5,$6)',
      [sessionId, questionId, answerGiven, q.rows[0].correct_answer, isCorrect, timeSpentSecs]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/student/session/complete', async (req, res) => {
  const { sessionId, score, total, timeSpentSecs } = req.body;
  try {
    await pool.query(
      'UPDATE sessions SET score=$1, total_questions=$2, time_spent_secs=$3, ended_at=NOW(), completed=TRUE WHERE id=$4',
      [score, total, timeSpentSecs, sessionId]
    );
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Teacher Routes ───────────────────────────────────────────────────────────

const TEACHER_PASS = process.env.TEACHER_PASSWORD || 'teacher123';

app.post('/api/teacher/login', (req, res) => {
  if (req.body.password !== TEACHER_PASS) return res.status(401).json({ error: 'Wrong password' });
  res.json({ ok: true });
});

app.get('/api/teacher/progress', async (req, res) => {
  if (req.query.password !== TEACHER_PASS) return res.status(401).json({ error: 'Unauthorized' });
  const date = req.query.date || new Date().toISOString().split('T')[0];
  try {
    const students = await pool.query('SELECT id, name FROM students ORDER BY name');
    const sessions = await pool.query(
      `SELECT DISTINCT ON (student_id, topic) student_id, topic, score, total_questions, time_spent_secs, completed
       FROM sessions WHERE date=$1 ORDER BY student_id, topic, id DESC`, [date]
    );
    const result = students.rows.map(student => {
      const ss = sessions.rows.filter(s => s.student_id === student.id);
      const topics = ['time','calendar','money'].map(topic => {
        const s = ss.find(r => r.topic === topic);
        return { topic, score: s?.score||0, total: s?.total_questions||0,
          completed: s?.completed||false, timeSpent: s?.time_spent_secs||0 };
      });
      return { id: student.id, name: student.name, topics,
        totalScore: topics.reduce((a,t)=>a+t.score,0),
        totalQuestions: topics.reduce((a,t)=>a+t.total,0),
        totalTime: topics.reduce((a,t)=>a+t.timeSpent,0),
        allCompleted: topics.every(t=>t.completed) };
    });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/teacher/student-detail', async (req, res) => {
  if (req.query.password !== TEACHER_PASS) return res.status(401).json({ error: 'Unauthorized' });
  const { studentId, date } = req.query;
  const d = date || new Date().toISOString().split('T')[0];
  try {
    const student = await pool.query('SELECT name FROM students WHERE id=$1', [studentId]);
    const sessions = await pool.query(
      `SELECT DISTINCT ON (topic) id, topic, score, total_questions, time_spent_secs, completed, started_at
       FROM sessions WHERE student_id=$1 AND date=$2 ORDER BY topic, id DESC`, [studentId, d]
    );
    const sessionsWithAnswers = await Promise.all(sessions.rows.map(async session => {
      const answers = await pool.query(
        `SELECT sa.answer_given, sa.correct_answer, sa.is_correct, sa.time_spent_secs, q.question_text
         FROM session_answers sa JOIN questions q ON q.id=sa.question_id
         WHERE sa.session_id=$1 ORDER BY sa.answered_at`, [session.id]
      );
      return { ...session, answers: answers.rows };
    }));
    res.json({ name: student.rows[0]?.name, sessions: sessionsWithAnswers });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

