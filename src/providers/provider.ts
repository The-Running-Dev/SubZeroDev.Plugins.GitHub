import type { Project } from '../models/project.js';

export interface ProjectProvider {
  readonly name: string;
  discover(): Promise<readonly Project[]>;
}
