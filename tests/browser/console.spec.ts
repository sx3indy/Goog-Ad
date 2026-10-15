import { test,expect } from '@playwright/test';
test.describe.configure({mode:'serial'});
test.beforeAll(async({request})=>{const headers={Origin:'http://127.0.0.1:3000'};expect((await request.post('/api/console',{headers,data:{action:'kill',customerId:'1234567890',killed:false}})).ok()).toBe(true);expect((await request.post('/api/console',{headers,data:{action:'refresh',customerId:'1234567890'}})).ok()).toBe(true);});
test('overview, navigation, search and attribution are functional',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await expect(page.getByRole('heading',{name:'Account overview'})).toBeVisible();await expect(page.getByText('Evergreen Living',{exact:true})).toBeVisible();
 await page.screenshot({path:'.local/overview.png',fullPage:true});
 await page.getByRole('button',{name:'Campaigns',exact:true}).click();await page.getByRole('textbox',{name:'Search campaigns'}).fill('memory');await expect(page.locator('tbody tr')).toHaveCount(1);
 await page.getByRole('button',{name:'Attribution',exact:true}).click();await expect(page.getByRole('heading',{name:'Business outcome funnel'})).toBeVisible();await expect(page.getByText('$8,000',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Integrations',exact:true}).click();await expect(page.getByRole('heading',{name:'Google Ads',exact:true})).toBeVisible();await expect(page.getByText('Demo adapter',{exact:true})).toBeVisible();
 expect(errors).toEqual([]);
});
test('approval queues a command and manual execution verifies it',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Decisions',exact:false}).first().click();
 await page.getByRole('button',{name:'Review decision',exact:true}).first().click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByText('Independent evidence',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Approve & queue'}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
 await expect(page.getByRole('button',{name:'Process next command'})).toBeEnabled();await page.getByRole('button',{name:'Process next command'}).click();
 await expect(page.locator('.decision-row .badge').filter({hasText:'verified'}).first()).toBeVisible();
 await page.getByRole('button',{name:'Audit trail',exact:true}).click();await expect(page.getByText('command · verified',{exact:true}).first()).toBeVisible();
});
test('kill switch persists and can be lifted without auto-resume',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Policies',exact:true}).click();await page.getByRole('button',{name:'Activate kill switch'}).click();
 await expect(page.getByText('Kill switch active.',{exact:false})).toBeVisible();await page.reload();await page.getByRole('button',{name:'Policies',exact:true}).click();await expect(page.getByRole('button',{name:'Lift execution suspension'})).toBeVisible();await page.getByRole('button',{name:'Lift execution suspension'}).click();await expect(page.getByRole('button',{name:'Activate kill switch'})).toBeVisible();
});
test('mobile layout remains usable and API rejects foreign origin',async({page,request})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.getByText('Evergreen Living',{exact:true})).toBeVisible();
 await page.screenshot({path:'.local/mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 const response=await request.post('/api/console',{headers:{Origin:'https://untrusted.example'},data:{action:'run'}});expect(response.status()).toBe(403);
});
test('live console shows unknown business metrics and queues source synchronization without demo execution',async({page,request})=>{
 const base=await (await request.get('/api/console')).json();
 const live={...base,mode:'live',actor:{role:'owner',displayName:'Account owner'},account:{...base.account,customer_id:'2847558521',name:'Senior Care Stars',connection_status:'pending'},campaigns:base.campaigns.map((c:any)=>({...c,metrics:{spendMicros:'0',impressions:10,clicks:1,platformConversions:0}})),outcomes:[],integrations:[],jobs:[],proposals:[],queue:[],executionGate:null,forecast:{...base.forecast,status:'unknown',forecastMicros:null,lowerMicros:null,upperMicros:null}};
 const mutations:any[]=[];
 await page.route('**/api/console',async route=>{if(route.request().method()==='POST'){mutations.push(route.request().postDataJSON());await route.fulfill({status:202,json:{id:'ui-fixture-job',status:'queued'}});}else await route.fulfill({json:live});});
 await page.goto('/');await expect(page.getByText('Account owner',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Sync Google Ads',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Refresh demo data',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Campaigns',exact:true}).click();await expect(page.locator('main')).not.toContainText('NaN');
 await page.getByRole('button',{name:'Attribution',exact:true}).click();await expect(page.getByRole('heading',{name:'Business outcomes unavailable'})).toBeVisible();
 await page.getByRole('button',{name:'Integrations',exact:true}).click();await page.getByRole('button',{name:'Sync hubspot',exact:true}).click();await expect.poll(()=>mutations.length).toBe(1);expect(mutations[0]).toEqual({action:'sync',customerId:'2847558521',provider:'hubspot'});
 await page.getByRole('button',{name:'Decisions',exact:true}).click();await expect(page.getByRole('button',{name:'Process next command'})).toBeDisabled();
});
