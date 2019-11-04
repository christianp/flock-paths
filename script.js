const svg = document.getElementById('svg');
const world = document.getElementById('world');
const trails = document.getElementById('trails');

const [MINX,MINY,MAXX,MAXY] = [-148.5, -105, 148.5, 105];
svg.setAttribute('viewBox',`${MINX} ${MINY} ${MAXX-MINX} ${MAXY-MINY}`);
const bg = svg.querySelector('#bg');
bg.setAttribute('x',MINX);
bg.setAttribute('y',MINY);
bg.setAttribute('width',MAXX-MINX);
bg.setAttribute('height',MAXY-MINY);

let NUM_BIRDS = 50;
let NUM_BEACONS = 10;
let SHRINK = 0.01;

let beacons = [];
let birds = [];


function html_element(name,attr,content) {
    const e = document.createElement(name);
    if(attr) {
        Object.entries(attr).forEach(([key,value])=>e.setAttribute(key,value));
    }
    if(content) {
        e.innerHTML = content;
    }
    return e;
}
function svg_element(name,attr,content) {
    const e = document.createElementNS("http://www.w3.org/2000/svg",name);
    if(attr) {
        Object.entries(attr).forEach(([key,value])=>e.setAttribute(key,value));
    }
    if(content) {
        e.innerHTML = content;
    }
    return e;
}

const inputs = [
    {label: 'Bird speed', id: 'MAX_SPEED', type: 'range', min: 0, max: 2, step: 0.001, value: 1},
    {label: 'Beacon speed', id: 'BEACON_SPEED', type: 'range', min: 0, max: 2, step: 0.001, value: 1},
    {label: 'Look radius', id: 'LOOK_RADIUS', type: 'range', min: 0, max: 100, step: 0.1, value: 20},
    {label: 'Avoid radius', id: 'AVOID_RADIUS', type: 'range', min: 0, max: 100, step: 0.1, value: 10},
    {label: 'Turn speed', id: 'TURN_SPEED', type: 'range', min: 0, max: Math.PI/10, step: 0.001, value: 0.1},
    {label: 'View angle', id: 'VIEW_ANGLE', type: 'range', min: 0, max: Math.PI, step: 0.001, value: Math.PI*2/3},
    {label: 'Gather strength', id: 'CLOSE_STRENGTH', type: 'number', min: 0, step: 0.01, value: 0.01},
    {label: 'Avoid strength', id: 'AVOID_STRENGTH', type: 'number', min: 0, step: 0.01, value: 0.2},
    {label: 'Steer strength', id: 'STEER_STRENGTH', type: 'number', min: 0, step: 0.01, value: 0.1},
    {label: 'Beacon strength', id: 'BEACON_STRENGTH', type: 'number', min: 0, step: 0.01, value: 0.01},
    {label: 'Reposition probability', id: 'REPOSITION_PROBABILITY', type: 'range', min: 0, max: 0.01, step: 0.0001, value: 0.01},
    {label: 'Trail length', id: 'TRAIL_LENGTH', type: 'number', min: 0, value: 500},
];

function unserialize_input(input) {
    const v = input.value;
    switch(input.getAttribute('type')) {
        case 'number':
        case 'range':
            return parseFloat(v);
        default:
            return v;
    }
}

const options = {};
const options_section = document.getElementById('options');
for(let def of inputs) {
    const span = html_element('span',{'class':'option'});
    const label = html_element('label',{'for':def.id},`${def.label}: `);
    const input = html_element('input',def);
    span.appendChild(label);
    span.appendChild(input);
    options_section.appendChild(span);
    input.addEventListener('input',e=>{
        options[def.id] = unserialize_input(input);
        if(def.type=='color') {
            set_colours();
        } else {
            debounce_remake();
        }
    });
    options[def.id] = unserialize_input(input);
    def.input = input;
}

let timeout = null;
function debounce_remake() {
    if(timeout) {
        clearTimeout(timeout);
    }
    timeout = setTimeout(update_settings,100);
}

function update_settings() {
    save_options();
}

const option_comment = document.createComment('');
svg.appendChild(option_comment);
function save_options() {
    localStorage.setItem('flock-options',JSON.stringify(options));
    option_comment.textContent = JSON.stringify(options);
}
function restore_options() {
    const saved_options = localStorage.getItem('flock-options');
    if(saved_options) {
        Object.assign(options,JSON.parse(saved_options));
        for(let def of inputs) {
            def.input.value = options[def.id];
        }
    }
}

function choice(l) {
    const i = Math.floor(Math.random()*l.length);
    return l[i];
}

function interpolate(min,max,t) {
    return min + (max-min)*t;
}
function randrange(a,b) {
    return interpolate(a,b,Math.random());
}

function dp(n) { return n.toFixed(5); }
function deg(rad) {
    return 180*rad/Math.PI;
}
function andiff(r1,r2) {
    let d = (r2 - r1) % (2*Math.PI);
    if(d < -Math.PI) {
        d += 2*Math.PI;
    } else if(d >= Math.PI) {
        d -= 2*Math.PI;
    }
    return d;
}
function clamp(min,max,v) {
    return Math.max(min,Math.min(max,v));
}

class Bird {
    constructor(x,y) {
        this.x = x;
        this.y = y;
        this.size = 1;
        this.beacon = choice(beacons);
        this.bearing = randrange(0,2*Math.PI);
        this.speed = randrange(0.8,1);
        this.vx = Math.cos(this.bearing)*this.speed*options.MAX_SPEED;
        this.vy = Math.sin(this.bearing)*this.speed*options.MAX_SPEED;
        this.hue = this.beacon.hue;
        this.sat = randrange(30,80);
        this.lum = randrange(60,95);
        this.color = `hsl(${dp(this.hue)},${dp(this.sat)}%,${dp(this.lum)}%)`;
        this.el = svg_element('g',{'class':'bird'},`<path class="body" d="M 1 0 L -2 -1 L -1 0 L -2 1 z" fill="${this.color}" stroke="black" stroke-width="0"/>`);
        this.trail = svg_element('path',{'class':'trail',d:'',stroke:this.color,fill:'none','stroke-width':"0.2"});
        this.trail_bits = [`${dp(this.x)} ${dp(this.y)}`];
        trails.appendChild(this.trail);
        world.appendChild(this.el);
        this.draw();
    }

    update(t) {
        this.x += this.vx;
        this.y += this.vy;
        /*
        if(this.x<MINX) {
            this.x += MAXX - MINX;
        } else if(this.x>MAXX) {
            this.x += MINX - MAXX;
        }
        if(this.y<MINY) {
            this.y += MAXY - MINY;
        } else if(this.y>MAXY) {
            this.y += MINY - MAXY;
        }
        */

        const close = [];
        for(let i=0;i<birds.length;i++) {
            const b2 = birds[i];
            if(b2!=this) {
                const dx = b2.x - this.x;
                const dy = b2.y - this.y;
                const an = Math.atan2(dy,dx);
                const dan = andiff(an,this.bearing);
                const d = dx*dx + dy*dy;
                if(d<options.LOOK_RADIUS*options.LOOK_RADIUS && Math.abs(dan)<options.VIEW_ANGLE) {
                    close.push(b2);
                }
            }
        }

        const nclose = birds.length;
        let cx=0, cy=0, ax=0, ay=0, sx=0, sy=0;
        let pvx = 0, pvy = 0;

        const bpos = this.beacon.pos(t);
        pvx += (bpos.x - this.x)*options.BEACON_STRENGTH;
        pvy += (bpos.y - this.y)*options.BEACON_STRENGTH;

        for(let i=0;i<close.length;i++) {
            const b2 = close[i];
            const dx = b2.x-this.x;
            const dy = b2.y-this.y;
            const d = dx*dx + dy*dy;
            cx += dx;
            cy += dy;
            pvx += cx*options.CLOSE_STRENGTH/nclose;
            pvy += cy*options.CLOSE_STRENGTH/nclose;
            if(d<options.AVOID_RADIUS*options.AVOID_RADIUS) {
                const s = (1-d/options.AVOID_RADIUS/options.AVOID_RADIUS);
                ax -= dx*s;
                ay -= dy*s;
                pvx += ax*options.AVOID_STRENGTH/nclose;
                pvy += ay*options.AVOID_STRENGTH/nclose;
            }
            sx += b2.vx;
            sy += b2.vy;
            pvx += sx*options.STEER_STRENGTH/nclose;
            pvy += sy*options.STEER_STRENGTH/nclose;

        }
        this.size = (this.size*(1-SHRINK) + 3/(Math.sqrt(close.length) + 1)*SHRINK);

        const pan = Math.atan2(pvy,pvx);
        this.bearing = this.bearing + andiff(this.bearing,pan)*options.TURN_SPEED;
        const speed = this.speed * options.MAX_SPEED;
        this.vx = Math.cos(this.bearing)*speed;
        this.vy = Math.sin(this.bearing)*speed;
    }

    draw() {
        this.el.setAttribute('transform',`translate(${dp(this.x)} ${dp(this.y)}) rotate(${dp(deg(this.bearing))}) scale(${dp(this.size)})`);
        this.trail_bits = this.trail_bits.slice(this.trail_bits.length-options.TRAIL_LENGTH);
        this.trail_bits.push(`${dp(this.x)} ${dp(this.y)}`);
        const trail = `M ${this.trail_bits[0]} `+this.trail_bits.map(b=>`L ${b}`).join(' ');
        this.trail.setAttribute('d',trail);
    }

    die() {
        birds = birds.filter(b=>b!=this);
        world.removeChild(this.el);
    }
}

class Beacon {
    constructor() {
        this.el = svg_element('circle',{'class':'beacon',r:0});
        world.appendChild(this.el);
        this.hue = beacons.length*(1+Math.sqrt(5))/2*180/Math.PI;
    }

    pos(t) {
        return {x:0,y:0};
    }

    update(t) {
    }

    draw(t) {
        const {x,y} = this.pos(t);
        this.el.setAttribute('cx',dp(x));
        this.el.setAttribute('cy',dp(y));
    }
}

class CircleBeacon extends Beacon {
    constructor(x,y,r) {
        super();
        this.x = x;
        this.y = y;
        this.r = r;
    }

    pos(t) {
        const circumference = this.r;
        const speed = options.MAX_SPEED/circumference;
        const x = Math.cos(t*speed)*this.r + this.x;
        const y = Math.sin(t*speed)*this.r + this.y;
        return {x,y};
    }
}

class PathBeacon extends Beacon {
    constructor(path,offset) {
        super();
        this.path = path;
        this.offset = offset;
        this.lengths = [];
        const n = this.path.length;
        this.length = 0;
        for(let i=0;i<n;i++) {
            const [a,b] = [this.path[i], this.path[(i+1)%n]];
            const [dx,dy] = [b.x-a.x, b.y-a.y];
            const d = Math.sqrt(dx*dx+dy*dy);
            this.length += d;
            this.lengths.push(d);
        }
    }

    pos(t) {
        const speed = options.BEACON_SPEED;
        t = (t*speed + this.offset*this.length) % (this.length);
        let tot = 0;
        for(let i=0;i<this.path.length;i++) {
            if(tot+this.lengths[i]>t) {
                const [a,b] = [this.path[i], this.path[(i+1)%this.path.length]];
                const dt = (t-tot)/this.lengths[i];
                const [x,y] = [interpolate(a.x,b.x,dt), interpolate(a.y,b.y,dt)];
                return {x,y};
            }
            tot += this.lengths[i];
        }
    }
}

class GraphBeacon extends Beacon {
    constructor(graph) {
        super();
        this.graph = graph;
        this.v1 = choice(graph);
        this.f = Math.random();
        this.select_next_vertex();
    }

    select_next_vertex(avoid) {
        this.v2 = choice(this.v1.neighbours.filter(v=>v!=avoid));
    }

    update(t) {
        const dx = this.v2.x - this.v1.x;
        const dy = this.v2.y - this.v1.y;
        const d = Math.sqrt(dx*dx+dy*dy);
        const speed = options.BEACON_SPEED;
        this.f += speed/d;
        if(this.f>1) {
            this.f -= 1;
            const ov1 = this.v1;
            this.v1 = this.v2;
            this.select_next_vertex(ov1);
        }
    }

    pos(t) {
        const x = this.f*(this.v2.x-this.v1.x) + this.v1.x;
        const y = this.f*(this.v2.y-this.v1.y) + this.v1.y;
        return {x,y};
    }
}


function graph(vertices,edges) {
    const everts = vertices.map(p=>{return {x:p.x,y:p.y}});
    everts.map((p,i)=>{
        p.neighbours = edges[i].map(j=>everts[j]);
    });
    return everts;
}
//const b = new CircleBeacon(0,0,50);
//beacons.push(b);
const square = [
    {x:-50,y:-100},
    {x:50,y:-100},
    {x:50,y:100},
    {x:-50,y:100}
];
const [zx,zy] = [Math.cos(Math.PI/4), Math.sin(Math.PI/4)];
const cube = [
    {x:-1,y:1},
    {x:-1,y:-1},
    {x:1,y:-1},
    {x:1,y:1},
    {x:1+zy,y:1+zy},
    {x:1+zx,y:-1-zy},
    {x:-1-zy,y:-1-zy},
    {x:-1-zy,y:1+zy},
].map(({x,y})=>{return {x:x*30,y:y*30}});

const poly = [];
for(let i=0;i<6;i++) {
    const an = 2*Math.PI*i/6;
    const r = 80;
    poly.push({
        x: r*Math.cos(an),
        y: r*Math.sin(an)
    });
}
poly.push({x:0,y:0});

const cube_edges = [
    [1,3,7],
    [0,2,6],
    [1,3,5],
    [0,2,4],
    [7,3,5],
    [2,4,6],
    [1,5,7],
    [0,4,6]
];
const cube_graph = graph(cube,cube_edges);

const herschel = [
    {x:0,y:-2},
    {x:-1,y:-0.5},
    {x:1,y:-0.5},
    {x:-3,y:0},
    {x:-2,y:0},
    {x:0,y:0},
    {x:2,y:0},
    {x:3,y:0},
    {x:-1,y:0.5},
    {x:1,y:0.5},
    {x:0,y:2}
].map(({x,y})=>{return {x:45*x,y:50*y}});
const herschel_edges = [
    [1,2,3,7],
    [0,4,5],
    [0,5,6],
    [0,4,10],
    [1,3,8],
    [1,2,8,9],
    [2,7,9],
    [0,6,10],
    [4,5,10],
    [5,6,10],
    [3,7,8,9]
]
const herschel_graph = graph(herschel, herschel_edges);

const path = [0,1,2,6,4,5,0,6,2,3,4,6].map(i=>poly[i]);
for(let i=0;i<NUM_BEACONS;i++) {
    beacons.push(new GraphBeacon(herschel_graph));
//    beacons.push(new PathBeacon(path,Math.random()));
}

for(let i=0;i<NUM_BIRDS;i++) {
    const x = randrange(MINX,MAXX);
    const y = randrange(MINY,MAXY);
    birds.push(new Bird(x,y));
}


let t = 0;
function frame() {
    const iters = 2;
    for(let i=0;i<iters;i++) {
        t += 1;
        if(Math.random()<options.REPOSITION_PROBABILITY) {
            const bird = choice(birds);
            if(bird) {
                bird.die();
                const [x,y] = choice([
                    [0,randrange(MINY,MAXY)],
                    [MAXX,randrange(MINY,MAXY)],
                    [randrange(MINX,MAXX),0],
                    [randrange(MINX,MAXX),MAXY]
                ]);
                birds.push(new Bird(x,y));
            }
        }
        for(let i=0;i<birds.length;i++) {
            const bird = birds[i];
            bird.update(t);
        }
        for(let i=0;i<beacons.length;i++) {
            beacons[i].update(t);
        }
    }
    for(let i=0;i<birds.length;i++) {
        const bird = birds[i];
        bird.draw(t);
    }
    for(let i=0;i<beacons.length;i++) {
        const beacon = beacons[i];
        beacon.draw(t);
    }
    requestAnimationFrame(frame);
}

restore_options();
frame();

function update_link() {
    const dsvg = svg.cloneNode(true);
    document.body.appendChild(dsvg);
    dsvg.setAttribute('width',"841mm");
    dsvg.setAttribute('height',"1189mm");
    const f = new File([dsvg.outerHTML],`flock-path-${new Date()-0}.svg`,{type:'image/svg+xml'});
    const url = URL.createObjectURL(f);
    document.getElementById('download').setAttribute('href',url);
    document.body.removeChild(dsvg);
}

document.getElementById('download').addEventListener('click',update_link);

