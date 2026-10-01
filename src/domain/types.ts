// Domain model from SPEC.md section 2. Framework-free: no UI or database imports in this folder.

export type ItemType = 'note' | 'task' | 'question';
export type ItemState = 'open' | 'resolved' | 'dropped';
export type PersonRole = 'owner' | 'recipient' | 'involved';
export type Flag = 'decision' | 'risk' | 'issue';

export interface Person {
  id: string;
  name: string;
  isSelf: boolean;
  roleDescription?: string;
  createdAt: string;
  deletedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  purpose?: string;
  status: 'active' | 'archived';
  createdAt: string;
  deletedAt?: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  status: 'upcoming' | 'held';
  kind: 'project' | 'one-to-one' | 'team' | 'other';
  attendeeIds: string[];
  projectIds: string[];
  rawNotes?: string;
  createdAt: string;
  deletedAt?: string;
}

export interface ItemPersonLink {
  personId: string;
  role: PersonRole;
  reportedBackAt?: string;
}

export interface Commitment {
  toPersonId: string;
  madeOn: string;
}

export interface ItemUpdate {
  at: string;
  text: string;
}

export interface ExternalLink {
  url: string;
  label?: string;
}

export interface Item {
  id: string;
  text: string;
  type: ItemType;
  originMeetingId: string;
  projectIds: string[];
  people: ItemPersonLink[];
  state: ItemState;
  resolvedAt?: string;
  answerText?: string;
  parentId?: string;
  updates: ItemUpdate[];
  commitment?: Commitment;
  dueBy?: string;
  importance?: 'low' | 'normal' | 'high';
  effortMinutes?: number;
  flags: Flag[];
  pinned: boolean;
  externalLinks: ExternalLink[];
  createdAt: string;
  touchedAt: string;
  deletedAt?: string;
}
