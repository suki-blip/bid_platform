/**
 * System Tests: Project CRUD Operations
 * Tests project creation, retrieval, update, deletion, and relationship with bids.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { getTestDb, cleanupTestDb, seedProject, seedBid } from '../helpers/test-db';

let db: Database.Database;

beforeEach(() => {
  db = getTestDb();
});

afterAll(() => {
  if (db?.open) db.close();
  cleanupTestDb();
});

describe('Project Creation', () => {
  it('should create a project with required fields only', () => {
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(id, 'My Project');

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    expect(project).toBeDefined();
    expect(project.name).toBe('My Project');
    expect(project.status).toBe('active');
    expect(project.created_at).toBeDefined();
  });

  it('should create a project with all fields', () => {
    const id = seedProject(db, {
      name: 'Full Project',
      address: '123 Main St',
      type: 'commercial',
      description: 'A full project',
      status: 'active',
    });

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    expect(project.name).toBe('Full Project');
    expect(project.address).toBe('123 Main St');
    expect(project.type).toBe('commercial');
    expect(project.description).toBe('A full project');
    expect(project.status).toBe('active');
  });

  it('should reject project without name (NOT NULL constraint)', () => {
    expect(() => {
      db.prepare('INSERT INTO projects (id, name) VALUES (?, ?)').run(crypto.randomUUID(), null);
    }).toThrow();
  });
});

describe('Project Retrieval', () => {
  it('should retrieve a project by ID', () => {
    const id = seedProject(db, { name: 'Retrievable Project' });
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    expect(project).toBeDefined();
    expect(project.name).toBe('Retrievable Project');
  });

  it('should list all projects', () => {
    seedProject(db, { name: 'Project 1' });
    seedProject(db, { name: 'Project 2' });
    seedProject(db, { name: 'Project 3' });

    const projects = db.prepare('SELECT * FROM projects').all();
    expect(projects).toHaveLength(3);
  });

  it('should return undefined for non-existent project', () => {
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get('non-existent');
    expect(project).toBeUndefined();
  });
});

describe('Project Update', () => {
  it('should update project fields', () => {
    const id = seedProject(db, { name: 'Old Name' });
    db.prepare('UPDATE projects SET name = ?, address = ?, status = ? WHERE id = ?').run('New Name', '456 Oak Ave', 'completed', id);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    expect(project.name).toBe('New Name');
    expect(project.address).toBe('456 Oak Ave');
    expect(project.status).toBe('completed');
  });
});

describe('Project Deletion', () => {
  it('should delete a project', () => {
    const id = seedProject(db, { name: 'To Delete' });
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);

    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    expect(project).toBeUndefined();
  });

  it('should set bids.project_id to NULL when project is deleted', () => {
    const projectId = seedProject(db, { name: 'Project To Delete' });
    const bidId = seedBid(db, { project_id: projectId });

    const bidBefore = db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId) as any;
    expect(bidBefore.project_id).toBe(projectId);

    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);

    const bidAfter = db.prepare('SELECT * FROM bids WHERE id = ?').get(bidId) as any;
    expect(bidAfter.project_id).toBeNull();
  });
});

describe('Project Bid Count', () => {
  it('should count bids per project', () => {
    const projectId = seedProject(db, { name: 'Counting Project' });
    seedBid(db, { title: 'Bid 1', project_id: projectId });
    seedBid(db, { title: 'Bid 2', project_id: projectId });
    seedBid(db, { title: 'Bid 3', project_id: projectId });

    const result = db.prepare(
      'SELECT (SELECT COUNT(*) FROM bids WHERE project_id = ?) as bid_count'
    ).get(projectId) as any;
    expect(result.bid_count).toBe(3);
  });

  it('should return 0 bid_count for project with no bids', () => {
    const projectId = seedProject(db, { name: 'Empty Project' });

    const result = db.prepare(
      'SELECT (SELECT COUNT(*) FROM bids WHERE project_id = ?) as bid_count'
    ).get(projectId) as any;
    expect(result.bid_count).toBe(0);
  });
});
