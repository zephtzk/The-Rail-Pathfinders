// Durable compare-and-swap contract. All mutation callbacks are replayable and
// side-effect free; external delivery only happens after a successful commit.
export const emptySharingState = () => ({version:1,shares:{},rates:{},subscriptions:{},outbox:{}});
export class D1SharingStore {
  constructor(database) { this.database=database; }
  async read() {
    const row=await this.database.prepare('SELECT revision, body FROM sharing_state WHERE id = ?').bind('pilot').first();
    return row?{revision:row.revision,value:JSON.parse(row.body)}:{revision:0,value:emptySharingState()};
  }
  async compareAndSwap(revision,value) {
    const body=JSON.stringify(value);
    const result=revision===0
      ?await this.database.prepare('INSERT OR IGNORE INTO sharing_state(id,revision,body) VALUES(?,1,?)').bind('pilot',body).run()
      :await this.database.prepare('UPDATE sharing_state SET revision=revision+1, body=? WHERE id=? AND revision=?').bind(body,'pilot',revision).run();
    return result.meta.changes===1;
  }
}
export function sharingStore(env) {
  if(env.SHARING_STORE?.read&&env.SHARING_STORE?.compareAndSwap)return env.SHARING_STORE;
  if(env.SHARING_DB?.prepare)return new D1SharingStore(env.SHARING_DB);
  return null;
}
export async function mutateSharing(store,change) {
  for(let attempt=0;attempt<12;attempt++) {
    const current=await store.read();
    const result=change(current.value);
    if(await store.compareAndSwap(current.revision,current.value))return result;
  }
  throw Object.assign(new Error('Storage busy. Retry the same event.'),{status:503});
}
