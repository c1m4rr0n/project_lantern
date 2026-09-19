import { readFile, writeFile, rename } from 'node:fs/promises';

export class JsonStore {
  constructor({ profilePath, opportunitiesPath }) {
    this.profilePath = profilePath;
    this.opportunitiesPath = opportunitiesPath;
  }
  async getProfile() { return JSON.parse(await readFile(this.profilePath, 'utf8')); }
  async saveProfile(profile) { const tmp=this.profilePath+'.tmp'; await writeFile(tmp, JSON.stringify(profile, null, 2)); await rename(tmp,this.profilePath); return profile; }
  async getOpportunities() { return JSON.parse(await readFile(this.opportunitiesPath, 'utf8')); }
  async saveOpportunities(items) { const tmp=this.opportunitiesPath+'.tmp'; await writeFile(tmp, JSON.stringify(items, null, 2)); await rename(tmp,this.opportunitiesPath); return items; }
}
