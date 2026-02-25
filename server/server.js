import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
app.use(cors()); // erlaubt Requests vom Angular Dev Server
app.use(express.json({ limit: '1mb' }));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'steps.json');

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DATA_FILE);
  } catch {
    await fs.writeFile(DATA_FILE, JSON.stringify([], null, 2), 'utf8');
  }
}

async function readSteps() {
  await ensureStorage();
  const raw = await fs.readFile(DATA_FILE, 'utf8');
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : [];
}

async function writeSteps(steps) {
  await ensureStorage();
  await fs.writeFile(DATA_FILE, JSON.stringify(steps, null, 2), 'utf8');
}

function newId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeVars(vars) {
  if (!Array.isArray(vars) || vars.length === 0) return undefined;

  const cleaned = vars
    .map((v) => ({
      key: v?.key != null ? String(v.key).trim() : '',
      label: v?.label != null ? String(v.label).trim() : '',
      placeholder: v?.placeholder != null ? String(v.placeholder) : undefined
    }))
    .filter((v) => v.key.length > 0 && v.label.length > 0);

  return cleaned.length ? cleaned : undefined;
}

// Healthcheck
app.get('/health', (_req, res) => res.json({ ok: true }));

// Alle Steps lesen
app.get('/steps', async (_req, res) => {
  const steps = await readSteps();
  res.json(steps);
});

// Neuen Step anlegen (unterstützt jetzt auch vars[])
app.post('/steps', async (req, res) => {
  const { title, category, icon, content, commands, vars } = req.body ?? {};

  if (!title || !category || !icon || !content) {
    return res.status(400).json({
      message: 'title, category, icon, content are required'
    });
  }

  const steps = await readSteps();

  const step = {
    id: newId(),
    title: String(title),
    category: String(category),
    icon: String(icon),
    content: String(content),

    // commands bleiben TEMPLATE strings (z.B. "sudo cp {{path}} ...")
    commands: Array.isArray(commands) && commands.length ? commands.map(String) : undefined,

    // NEU: Variablen-Definitionen pro Step
    vars: normalizeVars(vars),

    createdAt: new Date().toISOString()
  };

  steps.unshift(step);
  await writeSteps(steps);

  res.status(201).json(step);
});

// Step bearbeiten (unterstützt jetzt auch vars[])
app.put('/steps/:id', async (req, res) => {
  const { id } = req.params;
  const steps = await readSteps();
  const idx = steps.findIndex((s) => s.id === id);

  if (idx === -1) return res.status(404).json({ message: 'not found' });

  const patch = req.body ?? {};
  const updated = {
    ...steps[idx],
    ...patch,
    id,
    updatedAt: new Date().toISOString()
  };

  if (!updated.title || !updated.category || !updated.icon || !updated.content) {
    return res.status(400).json({
      message: 'title, category, icon, content are required'
    });
  }

  // commands normalisieren
  if (updated.commands !== undefined) {
    updated.commands =
      Array.isArray(updated.commands) && updated.commands.length
        ? updated.commands.map(String)
        : undefined;
  }

  // vars normalisieren
  if (updated.vars !== undefined) {
    updated.vars = normalizeVars(updated.vars);
  }

  steps[idx] = updated;
  await writeSteps(steps);

  res.json(updated);
});

// Step löschen
app.delete('/steps/:id', async (req, res) => {
  const { id } = req.params;
  const steps = await readSteps();
  const next = steps.filter((s) => s.id !== id);

  if (next.length === steps.length) return res.status(404).json({ message: 'not found' });

  await writeSteps(next);
  res.status(204).send();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  await ensureStorage();
  console.log(`API running: http://localhost:${PORT}`);
});