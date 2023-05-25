export type Point = [number, number];
type QuadEdgeSet = { le: QuadEdge, re: QuadEdge };

class QuadEdge {
    public onext: QuadEdge;
    public rot: QuadEdge;
    public orig: Point;
    public mark: boolean;

    constructor(onext: QuadEdge, rot: QuadEdge, orig: Point) {
        this.onext = onext;
        this.rot = rot;
        this.orig = orig;
        this.mark = false;
    }

    get sym(): QuadEdge { return this.rot.rot; }
    get dest(): Point { return this.sym.orig; }
    get rotSym(): QuadEdge { return this.rot.sym; }
    get oprev(): QuadEdge { return this.rot.onext.rot; }
    get dprev(): QuadEdge { return this.rotSym.onext.rotSym; }
    get lnext(): QuadEdge { return this.rotSym.onext.rot; }
    get lprev(): QuadEdge { return this.onext.sym; }
    get rprev(): QuadEdge { return this.sym.onext; }
}

export class Delaunay {
    public points: Point[];

    constructor(points?: Point[]) {
        this.points = points || [];
    }

    triangulate() {
        let pts = this.points;

        pts.sort(function(a: Point, b: Point) {
            if(a[0] === b[0])
                return a[1] - b[1];
            return a[0] - b[0];
        });

        for(let i = pts.length - 1; i >= 1; i--)
            if(pts[i][0] === pts[i - 1][0] && pts[i][1] === pts[i - 1][1])
                pts.splice(i, 1);

        if(pts.length < 2)
            return [];

        let quadEdge: QuadEdge = this.delaunay(pts).le;
        let faces: Point[] = [];
        let queueIndex = 0;
        let queue: QuadEdge[] = [quadEdge];

        while(this.leftOf(quadEdge.onext.dest, quadEdge))
            quadEdge = quadEdge.onext;

        let curr: QuadEdge = quadEdge;
        do {
            queue.push(curr.sym);
            curr.mark = true;
            curr = curr.lnext;
        } while(curr !== quadEdge);

        do {
            let edge: QuadEdge = queue[queueIndex++];
            if(!edge.mark) {
                curr = edge;
                do {
                    faces.push(curr.orig);
                    if (!curr.sym.mark)
                        queue.push(curr.sym);

                    curr.mark = true;
                    curr = curr.lnext;
                } while(curr != edge);
            }
        } while(queueIndex < queue.length);

        return faces;
    }

    ccw(a: Point, b: Point, c: Point) {
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > 0;
    }

    rightOf(x: Point, e: QuadEdge) {
        return this.ccw(x, e.dest, e.orig);
    }

    leftOf(x: Point, e: QuadEdge) {
        return this.ccw(x, e.orig, e.dest);
    }

    valid(e: QuadEdge, basel: QuadEdge) {
        return this.rightOf(e.dest, basel);
    }

    inCircle(a: Point, b: Point, c: Point, d: Point): boolean {

        if((a[0] === d[0] && a[1] === d[1])
            || (b[0] === d[0] && b[1] === d[1])
            || (c[0] === d[0] && c[1] === d[1]))
            return false;

        var sa = a[0] * a[0] + a[1] * a[1],
            sb = b[0] * b[0] + b[1] * b[1],
            sc = c[0] * c[0] + c[1] * c[1],
            sd = d[0] * d[0] + d[1] * d[1];

        var d1 = sc - sd,
            d2 = c[1] - d[1],
            d3 = c[1] * sd - sc * d[1],
            d4 = c[0] - d[0],
            d5 = c[0] * sd - sc * d[0],
            d6 = c[0] * d[1] - c[1] * d[0];

        return a[0] * (b[1] * d1 - sb * d2 + d3)
            - a[1] * (b[0] * d1 - sb * d4 + d5)
            + sa * (b[0] * d2 - b[1] * d4 + d6)
            - b[0] * d3 + b[1] * d5 - sb * d6 > 1; // We have an issue here with number accuracy
    }

    makeEdge(orig: Point, dest: Point) {
        const q0 = new QuadEdge(null!, null!, orig),
            q1 = new QuadEdge(null!, null!, null!),
            q2 = new QuadEdge(null!, null!, dest),
            q3 = new QuadEdge(null!, null!, null!);

        // create the segment
        q0.onext = q0; q2.onext = q2; // lonely segment: no "next" quadedge
        q1.onext = q3; q3.onext = q1; // in the dual: 2 communicating facets

        // dual switch
        q0.rot = q1; q1.rot = q2;
        q2.rot = q3; q3.rot = q0;
        return q0;
    }

    /**
     * Attach/detach the two edges = combine/split the two rings in the dual space
     *
     * @param a the first QuadEdge to attach/detach
     * @param b the second QuadEdge to attach/detach
     */
    splice(a: QuadEdge, b: QuadEdge) {
        const alpha = a.onext.rot,
            beta = b.onext.rot;

        const t2 = a.onext,
            t3 = beta.onext,
            t4 = alpha.onext;

        a.onext = b.onext;
        b.onext = t2;
        alpha.onext = t3;
        beta.onext = t4;
    }

    /**
     * Create a new QuadEdge by connecting 2 QuadEdges
     *
     * @param a the first QuadEdges to connect
     * @param b the second QuadEdges to connect
     * @return the new QuadEdge
     */
    connect(a: QuadEdge, b: QuadEdge) {
        const q = this.makeEdge(a.dest, b.orig);
        this.splice(q, a.lnext);
        this.splice(q.sym, b);
        return q;
    }

    deleteEdge(q: QuadEdge) {
        this.splice(q, q.oprev);
        this.splice(q.sym, q.sym.oprev);
    }

    delaunay(s: Point[]): QuadEdgeSet {
        var a, b, c, t;

        if(s.length === 2) {
            a = this.makeEdge(s[0], s[1]);
            return {
                le: a,
                re: a.sym
            }
        } else if(s.length === 3) {
            a = this.makeEdge(s[0], s[1]);
            b = this.makeEdge(s[1], s[2]);
            this.splice(a.sym, b);

            if(this.ccw(s[0], s[1], s[2])) {
                c = this.connect(b, a);
                return {
                    le: a,
                    re: b.sym
                }
            } else if(this.ccw(s[0], s[2], s[1])) {
                c = this.connect(b, a);
                return {
                    le: c.sym,
                    re: c
                }
            } else { // All three points are colinear
                return {
                    le: a,
                    re: b.sym
                }
            }
        } else { // |S| >= 4
            var half_length = Math.ceil(s.length / 2);
            var left = this.delaunay(s.slice(0,half_length));
            var right = this.delaunay(s.slice(half_length));

            var ldo = left.le,
                ldi = left.re,
                rdi = right.le,
                rdo = right.re;

            // Compute the lower common tangent of L and R
            do {
                if(this.leftOf(rdi.orig, ldi))
                    ldi = ldi.lnext;
                else if(this.rightOf(ldi.orig, rdi))
                    rdi = rdi.rprev;
                else
                    break;
            } while(true);

            var basel = this.connect(rdi.sym, ldi);
            if(ldi.orig === ldo.orig)
                ldo = basel.sym;
            if(rdi.orig === rdo.orig)
                rdo = basel;

            // This is the merge loop.
            do {
                // Locate the first L point (lcand.Dest) to be encountered by the rising bubble,
                // and delete L edges out of base1.Dest that fail the circle test.
                var lcand = basel.sym.onext;
                if(this.valid(lcand, basel)) {
                    while(this.inCircle(basel.dest, basel.orig, lcand.dest, lcand.onext.dest)) {
                        t = lcand.onext;
                        this.deleteEdge(lcand);
                        lcand = t;
                    }
                }

                //Symmetrically, locate the first R point to be hit, and delete R edges
                var rcand = basel.oprev;
                if(this.valid(rcand, basel)) {
                    while(this.inCircle(basel.dest, basel.orig, rcand.dest, rcand.oprev.dest)) {
                        t = rcand.oprev;
                        this.deleteEdge(rcand);
                        rcand = t;
                    }
                }

                // If both lcand and rcand are invalid, then basel is the upper common tangent
                if(!this.valid(lcand, basel) && !this.valid(rcand, basel))
                    break;

                // The next cross edge is to be connected to either lcand.Dest or rcand.Dest
                // If both are valid, then choose the appropriate one using the InCircle test
                if(!this.valid(lcand, basel) || (this.valid(rcand, basel) && this.inCircle(lcand.dest, lcand.orig, rcand.orig, rcand.dest)))
                // Add cross edge basel from rcand.Dest to basel.Dest
                    basel = this.connect(rcand, basel.sym);
                else
                // Add cross edge base1 from basel.Org to lcand. Dest
                    basel = this.connect(basel.sym, lcand.sym);
            } while(true);

            return {
                le: ldo,
                re: rdo
            }
        }
    }
}

