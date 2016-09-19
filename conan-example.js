void function() { "use strict";

var isBrowser = typeof window !== 'undefined';
if (!isBrowser) {
    global.requestAnimationFrame = callback => setTimeout(callback, 1000);
    global.cancelAnimationFrame = id => clearTimeout(id);
    global.Image = class { addEventListener(){} };
    global.conan = require('./conan.js');
}
function IMAGE (src) { var img = new Image(); img.src = src; return img; }

var containerWidth = 400;
var containerHeight = 500;
var useContainerScale = true;
var containerScaleUniform = true;
var c = conan;

// http://imgur.com/gallery/7YrHk
const IMG_TYRELLS = IMAGE('https://i.imgur.com/jUF6rcP.png');
const IMG_TULLYS = IMAGE('https://i.imgur.com/4DJnFif.png');
const IMG_MARTELLS = IMAGE('https://i.imgur.com/yd6mjSY.png');
const IMG_ARRYNS = IMAGE('http://i.imgur.com/YfPoIBw.png');

class Client {

    constructor (texture) {
        if (isBrowser) {
            return new DOMClient(texture);
        }

        this.texture = texture;
    }

    render (part) {
        if (part instanceof c.Part || part instanceof c.PinnedPart) {
            console.log(`Client ${part.renderId} : ${part.matrix}`);
        } else if (part instanceof c.Pin) {
            console.log(`Client ${part.renderId} : ${part.rendered().x().value},${part.rendered().y().value}`);
        }
    }
}

class DOMClient {

    constructor (texture) {
        this.el = null;
        this.texture = texture;
    }

    createElement () {
        var el = document.createElement('div');
        el['.conan'] = {};
        var style = el.style;
        style.position = 'absolute';
        document.getElementById('container').appendChild(el);
        this.el = el;
    }

    render (part) {

        if (!this.el) {
            this.createElement();
            this.el['.conan'].part = part;
        }

        var style = this.el.style;

        if (part instanceof c.Part || part instanceof c.PinnedPart) {

            style.opacity = 0.75;
            style.width = `${part.width().value}px`;
            style.height = `${part.height().value}px`;
            style.transformOrigin = '0 0';
            if (this.texture) {
                style.backgroundImage = `url(${this.texture.image.src})`;
                style.backgroundSize = 'contain';
            }

            style.transform = `translateZ(0) ${part.matrix}`;

        } else if (part instanceof c.Pin) {

            var size = 10;
            var size_2 = size/2;

            style.width = `${size}px`;
            style.height = `${size}px`;
            style.backgroundColor = '#000';
            style.borderRadius = `${size_2}px`;

            var matrix = new c.Matrix(1,0,0,1, part.rendered().x().value, part.rendered().y().value);
            style.transform = `translate3d(${-size_2}px, ${-size_2}px, 0) ${matrix}`;
        }
    }
}

var container, parent, child, sib, pin, pinned;

function init () {

    container = new c.Model().addChildren([
        parent = new c.Part(new Client(new c.Texture(IMG_TULLYS))), [
            child = new c.Part(new Client(new c.Texture(IMG_MARTELLS))), [
                pin = new c.Pin(new Client())
            ],
            sib = new c.Part(new Client(new c.Texture(IMG_TYRELLS)))
        ],
        
        pinned = new c.PinnedPart(new Client(new c.Texture(IMG_ARRYNS)))
    ]);

    parent.x(100);
    parent.y(150);

    child.x(50).subtract(
        new c.CalculatedValue().add(new c.RenderInput(0)).divide(3000/50).remainder(50)
    );
    child.originX(50);
    child.originY(50);
    child.rotation(45);

    sib.y().add(child.rendered().x());

    pin.x(0);
    pin.y(0);

    pinned.width(30);
    pinned.height(30);
    
    var a = pinned.pinA(0, 15);
    a.x(50);
    a.y(50);

    var b = pinned.pinB(30, 15);
    b.x().assign(child.rendered().x())
    b.y().assign(child.rendered().y())

    if (isBrowser) {
        attachToDOM();
    } else {
        container.render();
    }
}

function attachToDOM () {

    var domContainer = document.createElement('div');
    domContainer.id = 'container';
    document.body.appendChild(domContainer);

    var style = domContainer.style;
    style.width = `${containerWidth}px`;
    style.height = `${containerHeight}px`;
    style.border = '1px solid red';
    style.position = 'absolute';
    style.overflow = 'hidden';

    var animator = window.animator = new c.TimeAnimation();
    container.setRenderInputSource(0, animator);

    animator.onFrame = () => {

        if (useContainerScale) {
            if (containerScaleUniform) {
                var ratio = domContainer.clientWidth/containerWidth;
                container.scaleX(ratio);
                container.scaleY(ratio);
            } else {
                container.scaleX(domContainer.clientWidth/containerWidth);
                container.scaleY(domContainer.clientHeight/containerHeight);
            }
        } else {
            container.width(domContainer.clientWidth);
            container.height(domContainer.clientHeight);
        }

        container.render();
    };

    animator.play();
}

init();

}();
