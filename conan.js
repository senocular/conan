void function() { "use strict";

// TODO: list removals (removeChild, etc - have a listClass for this?)
// TODO: declarative connections? (by id?), definitions? {x:1, y:2, scaleX:1, scaleY:2, rotate:0, width:100, height:100}
// TODO: how clients handle render data. when do divs get created? How do they know where?
// TODO: arrangement && opacity. Arrangement order for render() calls in parent?
// TODO: Points in children - can't have children, have x() and y() source values. can be used for pins
// TODO: Pins as points in PinnedPart
// TODO: make sure origins work in dom client. May need to offset element by origin (transforms may not do this)
// TODO: origin for pinned part for children? make origin and location first pin?

class TimeAnimation {

    constructor () {

        this.isPlaying = false;
        this.value = 0;
        this.onFrame = null;

        this._renderFrameId = 0;
        this._timeStart = 0;
        this._timeOffset = 0;

        this._frameCallback = time => {

            if (!this._timeStart) {
                this._timeStart = time;
            }

            this.value = this._timeOffset + time - this._timeStart;

            if (this.onFrame) {
                this.onFrame();
            }

            if (this.isPlaying) {
                this._renderFrameId = requestAnimationFrame(this._frameCallback);
            }
        }
    }

    play () {
        this.isPlaying = true;
        this._frameCallback(0);
    }

    pause () {
        this.isPlaying = false;
        this._timeOffset = this.value;
        this._timeStart = 0;
        cancelAnimationFrame(this._renderFrameId);
    }
}

class Texture {

    constructor (image) {
        this.image = image;

        this.width = new ScalarValue(VALUE_SIZE.value);
        this.height = new ScalarValue(VALUE_SIZE.value);

        this._updateDimensions();
    }

    setImage (image) {
        this.image = image;
        this._updateDimensions();
    }

    _updateDimensions () {

        if (this.image) {

            if (this.image.complete) {
                this.width.value = this.image.naturalWidth;
                this.height.value = this.image.naturalHeight;
            } else {
                var onload = event => {
                    event.target.removeEventListener('load', onload);
                    this._updateDimensions();
                };
                this.image.addEventListener('load', onload);
            }
        }
    }
}

class RenderNode {

    constructor () {
        this.renderId = `render-node-${RenderNode.id++}`;
    }

    getRenderRequirements () {
        return null;
    }

    getRenderCommands () {
        return null;
    }

    getRenderChildren () {
        return null;
    }
}

RenderNode.id = 0;

class RenderInput extends RenderNode {

    constructor (index) {
        super();
        this.renderInputIndex = index;
        this.value = 0;
    }
}

class RenderCommandList {

    constructor (root) {
        this.root = root;
        this._commands = [];
        this._inputNodes = [];
        this._commandMap = {};
    }

    toString () {
        return this._commands.join(',');
    }

    get length () {
        return this._commands.length;
    }
 
    _resolveForRender (node) {

        this._requireForRender(node);

        var outs = node.getRenderChildren();

        if (outs) {
            for (var outNode of outs) {
                this._resolveForRender(outNode);
            }
        }
    }

    _requireForRender (node) {

        if (this._shouldRequire(node)) {

            var ins = node.getRenderRequirements();

            if (ins) {
                for (var inNode of ins) {
                    this._requireForRender(inNode);
                }
            }

            this._add(node);
        }
    }

    _shouldRequire (node) {

        if (!node || 'renderId' in node === false) {
            return false;
        }
 
        if (this._has(node)) {
            return false;
        }

        if (this._commandMap[node.renderId] === RenderCommandList.ADD_PENDING) {
            throw new Error('Circlular reference ' + node);
        }

        this._commandMap[node.renderId] = RenderCommandList.ADD_PENDING;
        return true;
    }

    _add (node) {

        if (!this._has(node)) {

            this._commandMap[node.renderId] = RenderCommandList.ADDED;

            var commands = node.getRenderCommands();
            if (commands) {

                // DEBUG:
                commands.forEach(cmd => console.log(`[${node.constructor.name} ${cmd.command.name}]`));

                this._commands.push(...commands);
            }

            if (node.renderInputIndex === 0 || node.renderInputIndex > 0) {
                this._inputNodes.push(node);
            }
        }
    }

    _has (node) {
        return this._commandMap[node.renderId] === RenderCommandList.ADDED;
    }

    render (inputSources) {

        // copy values from inputs to the render call into
        // the input value sources within the render stack

        for (var inputNode of this._inputNodes) {

            var inputSource = inputSources && inputSources[inputNode.renderInputIndex];

            if (inputSource) {
                inputNode.value = inputSource.value;
            }
        }

        // run through the stack commands

        this._commands.forEach(RenderCommand.render);
    }

    static compile (node) {

        // DEBUG:
        console.log('[Compiling...]');

        var list = new RenderCommandList(node);
        list._resolveForRender(node);

        // DEBUG:
        console.log(`[Compiled (${list._commands.length} commands)]`);

        return list;
    }

    static render (commandList, inputSources) {
        commandList.render(inputSources);
    }
}

Object.defineProperty(RenderCommandList.render, 'name', {value: 'RenderCommandList.render'});

RenderCommandList.ADD_PENDING = 1;
RenderCommandList.ADDED = 2;

class RenderCommand extends RenderNode {
    
    constructor (command, args, context) {
        super();
        this.command = command;
        this.args = args;
        this.context = context;
    }

    getRenderCommands () {
        return [this];
    }

    static render (renderCommand) {
        renderCommand.command.apply(renderCommand.context, renderCommand.args);
    }
}

Object.defineProperty(RenderCommand.render, 'name', {value: 'RenderCommand.render'});

var RenderContainerMixin = Base => class extends Base {

    constructor () {
        super();
        this.parent = null;
        this._children = [];
        this.transform = new Transform(this);
    }

    child (index) {
        return this._children[index];
    }

    children() {
        return this._children;
    }

    addChild (child) {
        if (child.parent) {
            child.parent.removeChild(child);
        }
        child.setParent(this);
        this._children.push(child);
    }

    addChildren (childList) {

        if (childList) {

            var lastChild = null;
            for (var child of childList) {

                if (Array.isArray(child)) {
                    if (lastChild) {
                        lastChild.addChildren(child);
                    }
                } else {
                    this.addChild(child);
                    lastChild = child;
                }
            }
        }

        return this;
    }

    removeChild (child) {
        var index = this._children.indexOf(child);
        if (index >= 0) {
            this._children.splice(index, 1);
            child.parent = null;
        }
    }

    setParent (parent) {
        this.parent = parent;
    }
}

class Part extends RenderContainerMixin(RenderNode) {
    
    constructor (client) {
        super();
        this.client = client;

        this._originX = null;
        this._originY = null;

        this._x = null;
        this._y = null;

        this._scaleX = null;
        this._scaleY = null;

        this._rotation = null;

        this._width = null;
        this._height = null;

        this._rendered = null;
    }

    originX (baseValue) {
        return this._getProp('_originX', baseValue);
    }

    originY (baseValue) {
        return this._getProp('_originY', baseValue);
    }

    x (baseValue) {
        return this._getProp('_x', baseValue);
    }

    y (baseValue) {
        return this._getProp('_y', baseValue);
    }

    scaleX (baseValue) {
        return this._getProp('_scaleX', baseValue, 1);
    }

    scaleY (baseValue) {
        return this._getProp('_scaleX', baseValue, 1);
    }

    rotation (baseValue) {
        return this._getProp('_rotation', baseValue);
    }

    width (baseValue) {
        return this._getProp('_width', baseValue, VALUE_SIZE.value);
    }

    height (baseValue) {
        return this._getProp('_height', baseValue, VALUE_SIZE.value);
    }

    _getProp (name, baseValue, defaultValue) {

        var attr = this[name];

        if (!attr) {
            attr = this[name] = new CalculatedValue(defaultValue);
        }

        if (baseValue !== undefined) {
            attr.setBaseValue(baseValue);
        }

        return attr;
    }

    get matrix () {
        return this.transform.contentMatrix;
    }

    rendered () {
        return this._rendered || (this._rendered = new PartRender(this));
    }

    getRenderRequirements () {

        var transformInputs = [
            this._x || VALUE_ZERO,
            this._y || VALUE_ZERO,
            this._scaleX || VALUE_ONE,
            this._scaleY || VALUE_ONE,
            this._rotation || VALUE_ZERO
        ];

        var originInputs = [
            this._originX || VALUE_ZERO,
            this._originY || VALUE_ZERO
        ];

        return [
            this.parent,
            ...transformInputs,
            new RenderCommand(MatrixTransformation.composeFromAttributes, [this.transform.matrix, ...transformInputs]),
            ...this.transform.transformations,
            this.parent && new RenderCommand(MatrixTransformation.concat, [this.transform.matrix, this.parent.transform.matrix]),
            ...originInputs,
            new RenderCommand(MatrixTransformation.updateContentMatrix, [this.transform.contentMatrix, ...originInputs, this.transform.matrix]),
            this._width,
            this._height
        ];
    }

    getRenderCommands () {
        return [
            new RenderCommand(Part.render, [this, this.client])
        ];
    }

    getRenderChildren () {
        return this.children();
    }

    static render (part, client) {
        if (part._rendered) {
            part._rendered.render();
        }
        if (client) {
            client.render(part);
        }
    }
}

Object.defineProperty(Part.render, 'name', {value: 'Part.render'});

class PartRender {

    constructor (part) {
        this.part = part;

        this._x = null;
        this._y = null;

        this._scaleX = null;
        this._scaleY = null;

        this._rotation = null;

        this._width = null;
        this._height = null;
    }

    x () {
        if (!this._x) {
            this._x = new ScalarValue(0, this.part);
            this._renderX();
        }
        return this._x;
    }

    y () {
        if (!this._y) {
            this._y = new ScalarValue(0, this.part);
            this._renderY();
        }
        return this._y;
    }

    scaleX () {
        if (!this._scaleX) {
            this._scaleX = new ScalarValue(1, this.part);
            this._renderScaleX();
        }
        return this._scaleX;
    }

    scaleY () {
        if (!this._scaleY) {
            this._scaleY = new ScalarValue(1, this.part);
            this._renderScaleY();
        }
        return this._scaleY;
    }

    rotation () {
        if (!this._rotation) {
            this._rotation = new ScalarValue(0, this.part);
            this._renderRotation();
        }
        return this._rotation;
    }

    width () {
        if (!this._width) {
            this._width = new ScalarValue(VALUE_SIZE.value, this.part);
            this._renderWidth();
        }
        return this._width;
    }

    height () {
        if (!this._height) {
            this._height = new ScalarValue(VALUE_SIZE.value, this.part);
            this._renderHeight();
        }
        return this._height;
    }

    render () {
        this._renderX();
        this._renderY();
        this._renderScaleX();
        this._renderScaleY();
        this._renderRotation();
        this._renderWidth();
        this._renderHeight();
    }

    _renderX () {
        if (this._x) this._x.value = this.part.matrix.x;
    }

    _renderY () {
        if (this._y) this._y.value = this.part.matrix.y;
    }

    _renderScaleX () {
        if (this._scaleX) this._scaleX.value = this.part.matrix.getScaleX();
    }

    _renderScaleY () {
        if (this._scaleY) this._scaleY.value = this.part.matrix.getScaleY();
    }

    _renderRotation () {
        if (this._rotation) {
            var rotation = this.part.matrix.getRotationX() * TO_DEGREES;
            if (rotation < 0) {
                rotation += 360;
            }
            this._rotation.value = rotation;
        }
    }

    _renderWidth () {
        if (this._width) this._width.value = this.part.width().value * this.part.matrix.getScaleX();
    }

    _renderHeight () {
        if (this._height) this._height.value = this.part.height().value * this.part.matrix.getScaleY();
    }
}

class Pin extends RenderNode {
    
    constructor (client) {
        super();
        this.client = client;

        this.parent = null;

        this._x = null;
        this._y = null;

        this._rendered = null;
    }

    x (baseValue) {
        return this._getProp('_x', baseValue);
    }

    y (baseValue) {
        return this._getProp('_y', baseValue);
    }

    _getProp (name, baseValue, defaultValue) {

        var attr = this[name];

        if (!attr) {
            attr = this[name] = new CalculatedValue(defaultValue);
        }

        if (baseValue !== undefined) {
            attr.setBaseValue(baseValue);
        }

        return attr;
    }

    rendered () {
        return this._rendered || (this._rendered = new PinRender(this));
    }

    setParent (parent) {
        this.parent = parent;
    }

    getRenderRequirements () {
        return [
            this.parent,
            this._x,
            this._y
        ];
    }

    getRenderCommands () {
        return [
            new RenderCommand(Pin.render, [this, this.client])
        ];
    }

    static render (pin, client) {
        if (pin._rendered) {
            pin._rendered.render();
        }
        if (client) {
            client.render(pin);
        }
    }
}

Object.defineProperty(Pin.render, 'name', {value: 'Pin.render'});

class PinRender {

    constructor (pin) {
        this.pin = pin;

        this._x = null;
        this._y = null;
    }

    x () {
        if (!this._x) {
            this._x = new ScalarValue(0, this.pin);
            this._renderX();
        }
        return this._x;
    }

    y () {
        if (!this._y) {
            this._y = new ScalarValue(0, this.pin);
            this._renderY();
        }
        return this._y;
    }

    render () {
        this._renderX();
        this._renderY();
    }

    _renderX () {
        if (this._x && this.pin.parent) {
            var matrix = this.pin.parent.matrix;
            var x = this.pin.x().value;
            var y = this.pin.y().value;
            this._x.value = matrix.getTransformedX(x, y);
        }
    }

    _renderY () {
        if (this._y && this.pin.parent) {
            var matrix = this.pin.parent.matrix;
            var x = this.pin.x().value;
            var y = this.pin.y().value;
            this._y.value = matrix.getTransformedY(x, y);
        }
    }
}

class PinnedPart extends RenderContainerMixin(RenderNode) {

    constructor (client) {
        super();
        this.client = client;

        this._width = null;
        this._height = null;

        this._rendered = null;

        this._pinA = null;
        this._pinB = null;
        this._pinC = null;
    }

    pinA (originX = 0, originY = 0) {
        return this._pinA || (this._pinA = new PinnedPartPin(this, originX, originY));
    }

    pinB (originX = 0, originY = 0) {
        return this._pinB || (this._pinB = new PinnedPartPin(this, originX, originY));
    }

    pinC (originX = 0, originY = 0) {
        return this._pinC || (this._pinC = new PinnedPartPin(this, originX, originY));
    }

    width (baseValue) {
        return this._getProp('_width', baseValue, VALUE_SIZE.value);
    }

    height (baseValue) {
        return this._getProp('_height', baseValue, VALUE_SIZE.value);
    }

    _getProp (name, baseValue, defaultValue) {

        var attr = this[name];

        if (!attr) {
            attr = this[name] = new CalculatedValue(defaultValue);
        }

        if (baseValue !== undefined) {
            attr.setBaseValue(baseValue);
        }

        return attr;
    }

    get matrix () {
        return this.transform.matrix;
    }

    rendered () {
        return this._rendered || (this._rendered = new PartRender(this));
    }

    getRenderRequirements () {

        var points = [];

        if (this._pinA) {
            points.push(...this._pinA.getPoints());
        }

        if (this._pinB) {
            points.push(...this._pinB.getPoints());
        }

        if (this._pinC) {
            points.push(...this._pinC.getPoints());
        }

        return [
            //this.parent, // TODO: are we inheriting anything from the parent?
            ...points,
            new RenderCommand(MatrixTransformation.composeFromPins, [this.transform.matrix, new Matrix(), points, this.width(), this.height()]),
            ...this.transform.transformations,
            
            // TODO: parent scale inherited for unpinned dimension?
            //this.parent && new RenderCommand(MatrixTransformation.concat, [this.transform.matrix, this.parent.transform.matrix]),
        ];
    }

    getRenderCommands () {
        return [
            new RenderCommand(PinnedPart.render, [this, this.client])
        ];
    }

    getRenderChildren () {
        return this.children();
    }

    static render (part, client) {
        if (part._rendered) {
            part._rendered.render();
        }
        if (client) {
            client.render(part);
        }
    }
}

class PinnedPartPin {

    constructor (pinnedPart, baseOriginX, baseOriginY) {
        this.pinnedPart = pinnedPart;

        this._originX = this._getProp('_originX', baseOriginX);
        this._originY = this._getProp('_originY', baseOriginY);
        this._x = null;
        this._y = null;
    }

    originX (baseValue) {
        return this._getProp('_originX', baseValue);
    }

    originY (baseValue) {
        return this._getProp('_originY', baseValue);
    }

    x (baseValue) {
        return this._getProp('_x', baseValue);
    }

    y (baseValue) {
        return this._getProp('_y', baseValue);
    }

    getPoints () {

        if (this._x || this._y) {

            return [
                this._originX || VALUE_ZERO,
                this._originY || VALUE_ZERO,
                this._x || VALUE_ZERO,
                this._y || VALUE_ZERO
            ];
        }

        return [];
    }

    _getProp (name, baseValue) {

        var attr = this[name];

        if (!attr) {
            attr = this[name] = new CalculatedValue();
        }

        if (baseValue !== undefined) {
            attr.setBaseValue(baseValue);
        }

        return attr;
    }
}

class Transform {
    
    constructor () {
        this.matrix = new Matrix();
        this.contentMatrix = new Matrix();
        this.transformations = [];
    }

    addTransformation (command) {
        var trans = new MatrixTransformation(this.matrix, command);
        this.transformations.push(trans);
        return trans;
    }
}

class MatrixTransformation extends RenderNode {
    
    constructor (matrix, command) {
        super();
        this.matrix = matrix;
        this.command = command;
        this.valueSource = new CalculatedValue();
    }

    addModified (modified) {
        return this.valueSource.addModified(modified);
    }

    getRenderRequirements () {
        return [this.valueSource];
    }

    getRenderCommands () {
        return [
            new RenderCommand(this.command, [this.matrix, this.valueSource])
        ];
    }
    
    static translateX (matrix, valueSource) {
        matrix.translateX(valueSource.value);
    }
    
    static translateY (matrix, valueSource) {
        matrix.translateY(valueSource.value);
    }
    
    static scaleX (matrix, valueSource) {
        matrix.scaleX(valueSource.value);
    }
    
    static scaleY (matrix, valueSource) {
        matrix.scaleY(valueSource.value);
    }
    
    static rotate (matrix, valueSource) {
        matrix.rotate(valueSource.value * TO_RADIANS);
    }
    
    static identity (matrix) {
        matrix.identity();
    }
    
    static concat (matrix, matrixValue) {
        matrix.concat(matrixValue);
    }

    static composeFromAttributes (matrix, x, y, scaleX, scaleY, rotation) {
        matrix.identity();
        matrix.scale(scaleX.value, scaleY.value);
        matrix.rotate(rotation.value * TO_RADIANS);
        matrix.translate(x.value, y.value);
    }

    static updateContentMatrix (contentMatrix, originX, originY, matrix) {
        contentMatrix.identity();
        contentMatrix.translate(-originX.value, -originY.value);
        contentMatrix.concat(matrix);
    }

    static composeFromPins (matrix, targetMatrix, points, width, height) {

        var pointCount = Math.floor(points.length/4);

        if (pointCount === 0) {

            // no points, no transform

            matrix.identity();
            return;
        }

        var [x1, y1, tx1, ty1, x2, y2, tx2, ty2, x3, y3, tx3, ty3] = points.map(p => p.value);

        if (pointCount === 1) {

            // one point is no transform except position

            matrix.identity();
            matrix.translate(tx1 - x1, ty1 - y1);
            return;
        }

        if (pointCount === 2) {

            // two points will get full transform but we
            // generate the 3rd point from a perpendicular
            // from the other two

            var angle = Math.atan2(y2 - y1, x2 - x1) + Math.PI/2;
            x3 = x1 + Math.cos(angle);
            y3 = y1 + Math.sin(angle);

            angle = Math.atan2(ty2 - ty1, tx2 - tx1) + Math.PI/2;
            tx3 = tx1 + Math.cos(angle);
            ty3 = ty1 + Math.sin(angle);
        }

        var w = width.value;
        var h = height.value;

        MatrixTransformation._assignSizedMatrix(matrix, w, h, x1, y1, x2, y2, x3, y3);
        matrix.invert();

        MatrixTransformation._assignSizedMatrix(targetMatrix, w, h, tx1, ty1, tx2, ty2, tx3, ty3);
        matrix.concat(targetMatrix);
    }

    static _assignSizedMatrix (m, w, h, x1, y1, x2, y2, x3, y3) {
        m.a = w ? (x2 - x1)/w : 0;
        m.b = w ? (y2 - y1)/w : 0;
        m.c = h ? (x3 - x1)/h : 0;
        m.d = h ? (y3 - y1)/h : 0;
        m.x = x1;
        m.y = y1;
    }
}

/**
 * Models encapsulate a collection of parts which have
 * a separate set of render inputs from the rest of the parts.
 */
class Model extends Part {

    constructor (client) {
        super(client);

        this._renderInputs = [];
        this._isSelfCompile = false;
        this._renderCommands = null;
    }

    getRenderInputSource (index) {
        return this._renderInputs[index];
    }

    setRenderInputSource (index, inputSource) {
        this._renderInputs[index] = inputSource;
    }

    getRenderRequirements () {
        if (this._isSelfCompile) {
            return null;
        }
        return super.getRenderRequirements();
    }

    getRenderCommands () {

        if (this._isSelfCompile) {
            return null;
        }

        var selfCommandList;

        try {
            this._isSelfCompile = true;
            selfCommandList = RenderCommandList.compile(this);
        } catch (err) {
            throw err;
        } finally {
            this._isSelfCompile = false;
        }

        return [
            ...super.getRenderCommands(),
            new RenderCommand(RenderCommandList.render, [selfCommandList, this._renderInputs])
        ];
    }

    getRenderChildren () {
        if (this._isSelfCompile) {
            return super.getRenderChildren();
        }
        return null;
    }

    compile () {
        this._renderCommands = RenderCommandList.compile(this);
    }

    render () {
        if (!this._renderCommands) {
            this.compile();
        }

        return this._renderCommands.render(this._renderInputs);
    }
}

const TO_RADIANS = Math.PI/180;
const TO_DEGREES = 180/Math.PI;

class CalculatedValue extends RenderNode {
    
    constructor (initialValue) {
        super();
        this.initialValue = ScalarValue.fromValue(initialValue);
        this.value = this.initialValue.value;
        this.modifiers = [];
    }

    addModified (modified) {
        modified.setTarget(this._lastModified());
        this.modifiers.push(modified);
        return this;
    }
    
    _lastModified () {
        var lastIndex = this.modifiers.length - 1;
        return this.modifiers[lastIndex] || this.initialValue;
    }

    setBaseValue (value) {
        this.value = this.initialValue.value = value;
        return this;
    }

    add (source) {
        this.addModified(new ModifiedValue(ModifiedValue.add, source));
        return this;
    }

    subtract (source) {
        this.addModified(new ModifiedValue(ModifiedValue.subtract, source));
        return this;
    }

    multiply (source) {
        this.addModified(new ModifiedValue(ModifiedValue.multiply, source));
        return this;
    }

    pow (source) {
        this.addModified(new ModifiedValue(ModifiedValue.pow, source));
        return this;
    }

    divide (source) {
        this.addModified(new ModifiedValue(ModifiedValue.divide, source));
        return this;
    }

    remainder (source) {
        this.addModified(new ModifiedValue(ModifiedValue.remainder, source));
        return this;
    }

    assign (source) {
        this.addModified(new ModifiedValue(ModifiedValue.assign, source));
        return this;
    }

    floor () {
        this.addModified(new ModifiedValue(ModifiedValue.call, Math.floor));
        return this;
    }

    ceil () {
        this.addModified(new ModifiedValue(ModifiedValue.call, Math.ceil));
        return this;
    }

    round () {
        this.addModified(new ModifiedValue(ModifiedValue.call, Math.round));
        return this;
    }

    getRenderRequirements () {
        return this.modifiers.length ? [this._lastModified()] : null; // each requires the one before it
    }

    getRenderCommands () {
        if (this.modifiers.length) {
            return [
                new RenderCommand(ModifiedValue.assign, [this, null, this._lastModified()])
            ];
        }

        return null;
    }
}

class ModifiedValue extends RenderNode {

    constructor (command, modifierValue) {
        super();
        this.command = command;
        this.modifier = ScalarValue.asSource(modifierValue);
        this.target = null;
        this.value = 0;
    }

    setTarget (targetSource) {
        this.target = targetSource;
    }

    getRenderRequirements () {
        return [this.target, this.modifier];
    }

    getRenderCommands () {
        return [
            new RenderCommand(this.command, [this, this.target, this.modifier])
        ];
    }

    static add (dest, target, modifier) {
        dest.value = target.value + modifier.value;
    }

    static subtract (dest, target, modifier) {
        dest.value = target.value - modifier.value;
    }

    static multiply (dest, target, modifier) {
        dest.value = target.value * modifier.value;
    }

    static pow (dest, target, modifier) {
        dest.value = Math.pow(target.value, modifier.value);
    }

    static divide (dest, target, modifier) {
        dest.value = modifier.value ? target.value / modifier.value : 0;
    }

    static remainder (dest, target, modifier) {
        dest.value = target.value % modifier.value;
    }

    static call (dest, target, method) {
        dest.value = method(target.value);
    }

    static assign (dest, target, modifier) {
        dest.value = modifier.value;
    }
}

class ScalarValue extends RenderNode {
    
    constructor (value, requirement) {
        super();
        this.value = value || 0;
        this.requirement = requirement;
    }

    set (value) {
        this.value = value;
    }

    getRenderRequirements () {
        return [this.requirement];
    }

    static asSource (valueOrSource) {
        return (valueOrSource && typeof valueOrSource === 'object') ? valueOrSource : new ScalarValue(valueOrSource);
    }

    static getValue (valueOrSource) {
        if (valueOrSource && typeof valueOrSource === 'object' && 'value' in valueOrSource) {
            return valueOrSource.value;
        }
        return valueOrSource || 0;
    }

    static fromValue (valueOrSource) {
        return new ScalarValue(ScalarValue.getValue(valueOrSource));
    }
}

const VALUE_ZERO = new ScalarValue(0);
const VALUE_ONE = new ScalarValue(1);
const VALUE_SIZE = new ScalarValue(100);

class Matrix {

    constructor (a, b, c, d, x, y) {
        this.a = (a != null) ? a : 1;
        this.b = b || 0;
        this.c = c || 0;
        this.d = (d != null) ? d : 1;
        this.x = x || 0;
        this.y = y || 0;
    }

    toString () {
        return `matrix(${this.a},${this.b},${this.c},${this.d},${this.x},${this.y})`;
    }

    isIdentity () {
        return this.equals(Matrix.IDENTITY);
    }

    equals (m) {
        if (this.a === m.a
        &&  this.b === m.b
        &&  this.c === m.c
        &&  this.d === m.d
        &&  this.x === m.x
        &&  this.y === m.y) {
            return true;
        }
        return false;
    }

    identity () {
        this.a = 1;
        this.b = 0;
        this.c = 0;
        this.d = 1;
        this.x = 0;
        this.y = 0;
    }

    clone () {
        return new Matrix(
            this.a,
            this.b,
            this.c,
            this.d,
            this.x,
            this.y
        );
    }

    copy (m) {
        this.a = m.a;
        this.b = m.b;
        this.c = m.c;
        this.d = m.d;
        this.x = m.x;
        this.y = m.y;
    }

    copyXY (m) {
        this.x = m.x;
        this.y = m.y;
    }

    copyScale (m) {
        this.a = m.a;
        this.b = m.b;
        this.c = m.c;
        this.d = m.d;
    }

    rotate (angle) {
        var u = Math.cos(angle);
        var v = Math.sin(angle);
        
        var temp = this.a;
        this.a = u * this.a - v * this.b;
        this.b = v * temp + u * this.b;
        temp = this.c;
        this.c = u * this.c - v * this.d;
        this.d = v * temp + u * this.d;
        temp = this.x;
        this.x = u * this.x - v * this.y;
        this.y = v * temp + u * this.y;
    }

    rotateXAxis (angle) {
        var u = Math.cos(angle);
        var v = Math.sin(angle);
        
        var temp = this.a;
        this.a = u * this.a - v * this.b;
        this.b = v * temp + u * this.b;
        this.y = v * temp + u * this.y;
    }

    rotateYAxis (angle) {
        var u = Math.cos(angle);
        var v = Math.sin(angle);
        
        var temp = this.c;
        this.c = u * this.c - v * this.d;
        this.d = v * temp + u * this.d;
        this.x = u * this.x - v * this.y;
    }

    rotateXY (angle) {
        var u = Math.cos(angle);
        var v = Math.sin(angle);
        
        var temp = this.x;
        this.x = u * this.x - v * this.y;
        this.y = v * temp + u * this.y;
    }

    rotateScale (angle) {
        var u = Math.cos(angle);
        var v = Math.sin(angle);
        
        var temp = this.a;
        this.a = u * this.a - v * this.b;
        this.b = v * temp + u * this.b;
        temp = this.c;
        this.c = u * this.c - v * this.d;
        this.d = v * temp + u * this.d;
    }

    translate (x, y) {
        this.x += x;
        this.y += y;
    }

    translateX (x) {
        this.x += x;
    }

    translateY (y) {
        this.y += y;
    }

    scale (x, y) {
        this.a *= x;
        this.b *= y;
        this.c *= x;
        this.d *= y;
        this.x *= x;
        this.y *= y;
    }

    scaleX (x) {
        this.a *= x;
        this.c *= x;
        this.x *= x;
    }

    scaleY (y) {
        this.b *= y;
        this.d *= y;
        this.y *= y;
    }

    concat (m) {
        var a = this.a * m.a;
        var b = 0;
        var c = 0;
        var d = this.d * m.d;
        var x = this.x * m.a + m.x;
        var y = this.y * m.d + m.y;
        
        if (this.b !== 0 || this.c !== 0 || m.b !== 0 || m.c !== 0) {
            a += this.b * m.c;
            d += this.c * m.b;
            b += this.a * m.b + this.b * m.d;
            c += this.c * m.a + this.d * m.c;
            x += this.y * m.c;
            y += this.x * m.b;
        }
        
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
        this.x = x;
        this.y = y;
    }

    concatScale (m) {
        var a = this.a * m.a;
        var b = 0;
        var c = 0;
        var d = this.d * m.d;
        
        if (this.b !== 0 || this.c !== 0 || m.b !== 0 || m.c !== 0) {
            a += this.b * m.c;
            d += this.c * m.b;
            b += this.a * m.b + this.b * m.d;
            c += this.c * m.a + this.d * m.c;
        }
        
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
    }

    concatXY (m) {
        var x = m.x + this.x * m.a + this.y * m.c;
        var y = m.y + this.y * m.d + this.x * m.b;
        this.x = x;
        this.y = y;
    }

    invert () {
        if (this.b === 0 && this.c === 0 && this.a !== 0 && this.d !== 0) {
            
            this.a = 1/this.a;
            this.d = 1/this.d;
            this.b = 0;
            this.c = 0; 
            this.x = -this.a * this.x;
            this.y = -this.d * this.y;
            
        }else{

            var det = this.a * this.d - this.b * this.c;
            if (det === 0) {
                this.identity();
                return;
            }
            det = 1/det;
            
            var temp = this.a;
            this.a = this.d * det;
            this.b = -this.b * det;
            this.c = -this.c * det;
            this.d = temp * det;
            
            temp = this.y;
            this.y = -(this.b * this.x + this.d * this.y);
            this.x = -(this.a * this.x + this.c * temp);
        }
    }

    getScaleX () {
        return Math.sqrt(this.a * this.a + this.b * this.b);
    }

    getScaleY () {
        return Math.sqrt(this.c * this.c + this.d * this.d);
    }

    getRotationX () {
        return Math.atan2(this.b, this.a);
    }

    getRotationY () {
        return Math.atan2(this.c, this.d);
    }

    getTransformedX (x, y) {
        return this.x + this.a * x + this.c * y;
    }

    getTransformedY (x, y) {
        return this.y + this.d * y + this.b * x;
    }

    containsPoint (x, y, w, h) {

        // find mouse in local target space
        // and check within bounds of that area
        var inv = this.clone();
        inv.invert();
        
        var tx = inv.x + inv.a * x + inv.c * y;
        var ty = inv.y + inv.d * y + inv.b * x;
        
        // compare locations in non-transformed space (inverted)
        if (tx >= 0 && tx <= w && ty >= 0 && ty <= h) {
            return true;
        }
        
        return false;
    }
}

Matrix.IDENTITY = new Matrix();

var exported = {
    CalculatedValue,
    Matrix,
    Model,
    Part,
    Pin,
    PinnedPart,
    RenderInput,
    Texture,
    TimeAnimation
};

if (typeof window !== 'undefined') {
    window.conan = exported;
} else {
    module.exports = exported;
}

}();
