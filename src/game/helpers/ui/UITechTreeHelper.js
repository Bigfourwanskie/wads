// Creates and updates maps (mini-map and main)
define(['ash',
    'game/GameGlobals',
    'game/constants/CanvasConstants',
    'game/constants/PlayerActionConstants',
    'game/constants/UpgradeConstants',
    'game/nodes/tribe/TribeUpgradesNode'],
function (Ash, GameGlobals, CanvasConstants, PlayerActionConstants, UpgradeConstants, TribeUpgradesNode) {
    
    var UITechTreeNode = Ash.Class.extend({
        
        definition: null,
        level: 0,
        requiresIDs: [],
        requires: [],
        requiredBy: [],
        requiredByByLevel: {},
        
        constructor: function () {
            this.requiresIds = [];
            this.requires = [];
            this.requiredBy = [];
            this.requiredByByLevel = {};
            this.x = -1;
            this.y = -1;
        },
    });
    
    var TechTree = Ash.Class.extend({
        
        roots: [],
        nodesById: {},
        
        constructor: function () {
            this.roots = [];
            this.grid = [];
            this.nodesById = {};
            this.maxX = -1;
            this.maxY = -1;
        },
        
        addNode: function (node) {
            if (node.requiresIDs.length === 0)
                this.addRootNode(node);
            this.nodesById[node.definition.id] = node;
        },
        
        addRootNode: function (node) {
            var i = 0;
            for (i; i <= this.roots.length; i++) {
                if (i === this.roots.length)
                    break;
                if (this.roots[i].campOrdinal >= node.campOrdinal)
                    break;
            }
            this.roots.splice(i, 0, node);
        },
        
        connectNodes: function () {
            var node;
            var requiredId;
            var requiredNode;
            for (var id in this.nodesById) {
                node = this.nodesById[id];
                for (var i = 0; i < node.requiresIDs.length; i++) {
                    requiredId = node.requiresIDs[i];
                    requiredNode = this.nodesById[requiredId];
                    if (requiredNode) {
                        node.requires.push(requiredNode);
                        requiredNode.requiredBy.push(node);
                        if (!requiredNode.requiredByByLevel[node.level])
                            requiredNode.requiredByByLevel[node.level] = [];
                        requiredNode.requiredByByLevel[node.level].push(node);
                    } else {
                        console.log("WARN: Missing required node: " + requiredId);
                    }
                }
            }
        },
        
        pruneNodes: function (tribeNodes) {
            var node;
            for (var id in this.nodesById) {
                node = this.nodesById[id];
                
                // unlocked
                if (tribeNodes.head.upgrades.hasUpgrade(node.definition.id))
                    continue;
                
                // available
                var isAvailable = GameGlobals.playerActionsHelper.checkRequirements(node.definition.id, false).value > 0;
                if (isAvailable)
                    continue;
                    
                // visible (requirements available)
                var isVisible = false;
                var reqs = GameGlobals.playerActionsHelper.getReqs(node.definition.id);
                var isMissingBlueprint = reqs && reqs.blueprint && !tribeNodes.head.upgrades.hasAvailableBlueprint(node.definition.id);
                if (!isMissingBlueprint) {
                    for (var i = 0; i < node.requires.length; i++) {
                        isVisible = isVisible || GameGlobals.playerActionsHelper.checkRequirements(node.requires[i].definition.id, false).value > 0;
                    }
                }
                if (isVisible)
                    continue;
                    
                // none of the above - prune
                this.removeNode(this.nodesById[id]);
            }
        },
        
        removeNode: function (node) {
            if (this.roots.indexOf(node) >= 0)
                this.roots.splice(this.roots.indexOf(node), 1);
            
            var requiredNode;
            for (var i = 0; i < node.requires.length; i++) {
                requiredNode = node.requires[i];
                requiredNode.requiredBy.splice(requiredNode.requiredBy.indexOf(node), 1);
                requiredNode.requiredByByLevel[node.level].splice(requiredNode.requiredByByLevel[node.level].indexOf(node), 1);
            }
        },
        
        getDepth: function (fromNode) {
            var maxD = 0;
            var d = 0;
            var searchNodes = fromNode ? fromNode.requiredBy : this.roots;
            for (var i = 0; i < searchNodes.length; i++) {
                var searchNodeValue = fromNode ? 1 : searchNodes[i].level;
                 d = searchNodeValue + this.getDepth(searchNodes[i]);
                 if (d > maxD) maxD = d;
            }
            return maxD;
        },
        
        toString: function () {
            return "TechTree (" + this.roots.length + ")";
        },
    });
    
    var UITechTreeHelper = Ash.Class.extend({
        
        canvas: null,
        ctx: null,
        
        cellW: 85,
        cellH: 22,
        cellPX: 20,
        cellPY: 15,
        treePX: 20,
        treePY: 20,
        
        constructor: function (engine) {
			this.tribeNodes = engine.getNodeList(TribeUpgradesNode);
        },
        
        enableScrolling: function (canvasId) {
            CanvasConstants.makeCanvasScrollable(canvasId);
            CanvasConstants.updateScrollEnable(canvasId);
        },
        
        drawTechTree: function (canvasId, overlayId) {
            var tree = this.makeTechTree();
            var y = 0;
            for (var i = 0; i < tree.roots.length; i++) {
                y = y + this.positionRoot(tree, tree.roots[i], y);
            }
            var dimensions = this.getTreeDimensions(canvasId, tree.maxX, tree.maxY);
            var sunlit = $("body").hasClass("sunlit");
            
            // TODO extend to several required tech per tech; currently drawing assumes max 1
            
            this.drawCanvas(canvasId, tree, dimensions, sunlit);
            this.rebuildOverlay(overlayId, tree, dimensions, sunlit);
            CanvasConstants.updateScrollEnable(canvasId);
            CanvasConstants.updateScrollIndicators(canvasId);
        },
        
        drawCanvas: function (canvasId, tree, dimensions, sunlit) {
            this.canvas = $("#" + canvasId)[0];
            this.ctx = this.canvas ? this.canvas.getContext && this.canvas.getContext('2d') : null;
            
            if (!this.ctx)
                return;
            
            this.ctx.canvas.width = dimensions.canvasWidth;
            this.ctx.canvas.height = dimensions.canvasHeight;
            this.ctx.clearRect(0, 0, this.canvas.scrollWidth, this.canvas.scrollWidth);
            this.ctx.fillStyle = CanvasConstants.getBackgroundColor(sunlit);
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

			for (var i = 0; i < tree.roots.length; i++) {
                this.drawRoot(tree.roots[i], sunlit);
            }
        },
        
        rebuildOverlay: function (overlayId, tree, dimensions, sunlit) {
            var $overlay = $("#" + overlayId);
            $overlay.empty();
            $overlay.css("width", dimensions.canvasWidth + "px");
            $overlay.css("height", dimensions.canvasHeight + "px");
            
			for (var i = 0; i < tree.roots.length; i++) {
                var root = tree.roots[i];
                this.addOverlayNodes($overlay, root);
            }
        },
        
        addOverlayNodes: function ($overlay, root) {
            this.addOverlayNode($overlay, root);
            for (var level in root.requiredByByLevel) {
                for (var j = 0; j < root.requiredByByLevel[level].length; j++) {
                    this.addOverlayNodes($overlay, root.requiredByByLevel[level][j]);
                }
            }
        },
        
        addOverlayNode: function ($overlay, node) {
            var xpx = this.getPixelPosX(node.x);
            var ypx = this.getPixelPosY(node.y);
            var data = "data-id='" + node.definition.id + "'";
            var text = node.definition.name;
            var $div = $("<div class='canvas-overlay-cell upgrades-overlay-cell' style='top: " + ypx + "px; left: " + xpx + "px' " + data +"><p>" + text +"</p></div>");
            $div.click(function (e) {
                var $target = $(e.target);
                var id =  node.definition.id;
                console.log("tech selected: " + id);
            });
            $overlay.append($div);
        },
        
        isOccupied: function (tree, x, y) {
            var gridX = Math.round(x*4) / 4;
            var gridY = Math.round(y*4) / 4;
            if (gridX < 0 || gridY < 0) return true;
            if (!tree.grid[gridY]) return false;
            return tree.grid[gridY][gridX];
        },
        
        isOccupiedArea: function (tree, x, y, p) {
            return this.isOccupied(tree, x, y) || this.isOccupied(tree, x + p, y) || this.isOccupied(tree, Math.max(x - p, 0), y) || this.isOccupied(tree, x, y + p) || this.isOccupied(tree, x, Math.max(y - p, 0));
        },
        
        positionNode: function (tree, node, x, y) {
            node.x = Math.round(x * 10)/10;
            node.y = Math.round(y * 10)/10;
            if (node.x > tree.maxX) tree.maxX = node.x;
            if (node.y > tree.maxY) tree.maxY = node.y;
            var gridX = Math.round(x*4) / 4;
            var gridY = Math.round(y*4) / 4;
            if (!tree.grid[gridY]) tree.grid[gridY] = {};
            if (tree.grid[gridY][gridX]) console.log("WARN: Overriding position: " + gridX + "," + gridY + " with " + node.definition.name);
            tree.grid[gridY][gridX] = node;
        },
        
        positionChildren: function (tree, parent, yHeight, x, y) {
            var child;
            var l = 0;
            var childYHeight = 0.825;
            var numChildren = parent.requiredBy.length;
            if (numChildren > yHeight) yHeight = numChildren * childYHeight;
            
            var maxYoffset = 0;
            if (numChildren == 2) maxYoffset = childYHeight / 2;
            if (numChildren > 2) maxYoffset = childYHeight;
            
            for (var i = 0; i < parent.requiredBy.length; i++) {
                child = parent.requiredBy[i];
                var ydiff = i * childYHeight;
                var childX = Math.max(x + 1, child.level);
                var childY = y + ydiff;
                if (maxYoffset > 0) {
                    var yOffset = 0;
                    var isOccupied = this.isOccupiedArea(tree, childX, childY - maxYoffset, i == 0 ? 0.5 : 0.35);
                    if (!isOccupied) {
                        yOffset = -maxYoffset;
                        childY += yOffset;
                    } else {
                        maxYoffset = 0;
                    }
                }
                while (this.isOccupiedArea(tree, childX, childY, 0.4)) {
                    if (childY < 0) break;
                    if (childY > y + ydiff + numChildren * childYHeight) break;
                    childY += 0.4;
                }
                this.positionNode(tree, child, childX, childY);
                var childHeight = this.positionChildren(tree, child, yHeight, child.x, child.y);
                yHeight = Math.max(yHeight, childHeight);
            }
            for (var i = 0; i < parent.requiredBy.length; i++) {
                child = parent.requiredBy[i];
            }
            return Math.max(1, yHeight);
        },
        
        positionRoot: function (tree, root, y) {
            var x = Math.max(0, root.level - 1);
            var yHeight = 1;
            this.positionNode(tree, root, x, y);
            yHeight = this.positionChildren(tree, root, yHeight, x, y);
            return yHeight;
        },
        
        drawRoot: function (root, sunlit) {
            this.drawNode(root);
            for (var level in root.requiredByByLevel) {
                for (var i = 0; i < root.requiredByByLevel[level].length; i++) {
                    this.drawRoot(root.requiredByByLevel[level][i], sunlit);
                }
            }
        },
        
        drawNode: function (node, sunlit) {
            var pixelX = this.getPixelPosX(node.x);
            var pixelY = this.getPixelPosY(node.y);
            
            // arrows
            for (var i = 0; i < node.requiredBy.length; i++) {
                var targetGridX = node.requiredBy[i].x;
                var targetGridY = node.requiredBy[i].y;
                var arrowstartxOffset = -Math.abs(node.y - targetGridY) * this.cellW / 16;
                this.drawArrow(
                    pixelX + this.cellW + arrowstartxOffset,
                    pixelY + this.cellH / 2,
                    this.getPixelPosX(targetGridX) - this.cellPX / 5,
                    this.getPixelPosY(targetGridY) + this.cellH / 2
                );
            }
            
            // node
            this.ctx.fillStyle = this.getFillColor(node, sunlit);
            this.ctx.fillRect(pixelX, pixelY, this.cellW, this.cellH);
            
            // available border
            var hasUpgrade =  this.tribeNodes.head.upgrades.hasUpgrade(node.definition.id);
            var isAvailable = GameGlobals.playerActionsHelper.checkRequirements(node.definition.id, false).value > 0;
            if (!hasUpgrade && isAvailable) {
                this.ctx.lineWidth = 3;
                this.ctx.strokeStyle = sunlit ? "#444" : "#ccc";
                this.ctx.beginPath();
                this.ctx.moveTo(pixelX, pixelY);
                this.ctx.lineTo(pixelX + this.cellW, pixelY);
                this.ctx.lineTo(pixelX + this.cellW, pixelY + this.cellH);
                this.ctx.lineTo(pixelX, pixelY + this.cellH);
                this.ctx.lineTo(pixelX, pixelY);
                this.ctx.stroke();
                this.ctx.closePath();
            }
        },
        
        getPixelPosX: function (x) {
            return this.treePX + x * this.cellW + x * this.cellPX;
        },
        
        getPixelPosY: function (y) {
            return this.treePY + y * this.cellH + y * this.cellPY;
        },
        
        drawArrow: function (fromx, fromy, tox, toy) {
            if (fromx < 0 || fromy < 0 || tox < 0 || toy < 0)
                return;
                
            var angle = Math.atan2(toy-fromy,tox-fromx);
            
            // arrow line
            this.ctx.strokeStyle = "#777";
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(fromx, fromy);
            var pointsAligned = fromy == toy || fromx == tox;
            var pointsClose = Math.abs(fromy - toy) < this.cellH && Math.abs(fromx - tox) < this.cellW;
            if (pointsAligned || pointsClose) {
                this.ctx.lineTo(tox, toy);
            } else {
                var quadx = this.getCurveControlX(fromx, fromy, tox, toy);
                var quady = this.getCurveControlY(fromx, fromy, tox, toy);
                this.ctx.quadraticCurveTo(quadx, quady, tox, toy);
                // uncomment to see control points
                //this.ctx.fillRect(quadx,quady,4,4);
                angle = Math.abs(fromx - tox) > Math.abs(fromy - toy) ? 0 : angle / 2;
            }
            this.ctx.stroke();
            
            // arrowhead
            var headlen = 8;
            this.ctx.fillStyle = "#777";
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(tox, toy);
            this.ctx.lineTo(tox-headlen*Math.cos(angle-Math.PI/6),toy-headlen*Math.sin(angle-Math.PI/6));
            this.ctx.moveTo(tox, toy);
            this.ctx.lineTo(tox-headlen*Math.cos(angle+Math.PI/6),toy-headlen*Math.sin(angle+Math.PI/6));
            this.ctx.lineTo(tox-headlen*Math.cos(angle-Math.PI/6),toy-headlen*Math.sin(angle-Math.PI/6));
            this.ctx.fill();
            this.ctx.closePath();
        },
        
        makeTechTree: function () {
            var definition;
            var tree = new TechTree();
            var node;
            var ids = Object.keys(UpgradeConstants.upgradeDefinitions)
            ids.sort(function (a, b) {
				var levela = UpgradeConstants.getMinimumCampOrdinalForUpgrade(a);
				var levelb = UpgradeConstants.getMinimumCampOrdinalForUpgrade(b);
				return levela - levelb;
            });
			for (var i = 0; i < ids.length; i++) {
                definition = UpgradeConstants.upgradeDefinitions[ids[i]];
                var reqs = PlayerActionConstants.requirements[definition.id];
                node = new UITechTreeNode();
                node.definition = definition;
                node.campOrdinal = UpgradeConstants.getMinimumCampOrdinalForUpgrade(definition.id);
                node.level = Math.floor(node.campOrdinal / 3);
                node.requiresIDs = reqs && reqs.upgrades ? Object.keys(reqs.upgrades) : [];
                tree.addNode(node);
            }
            tree.connectNodes();
            tree.pruneNodes(this.tribeNodes, GameGlobals.playerActionsHelper);
            return tree;
        },
        
        getTreeDimensions: function (canvasId, maxX, maxY) {
            var dimensions = {};
            var canvas = $("#" + canvasId);
            dimensions.treeWidth = (maxX + 1) * this.cellW + maxX * this.cellPX + 2 * this.treePX;
            dimensions.treeHeight = (maxY + 1) * this.cellH + maxY * this.cellPY + 2 * this.treePY;
            dimensions.canvasWidth = Math.max(dimensions.treeWidth, $(canvas).parent().width());
            dimensions.canvasHeight = Math.max(dimensions.treeHeight, 100);
            return dimensions;
        },
        
        getCurveControlX: function (fromx, fromy, tox, toy) {
            // steeper curve (x control closer to fromx) when target is further away
            var result = fromx + this.cellW / 4 * 3 - (tox - fromx);
            result = Math.max(result, fromx );
            result = Math.min(result, (fromx + tox) / 2);
            return result;
        },
        
        getCurveControlY: function (fromx, fromy, tox, toy) {
            if (fromy == toy) return fromy;
            
            var xdist = Math.abs(fromx - tox);
            if (xdist > this.cellW + this.cellPX * 2) {
                // long distance, add some extra curviness to avoid overlaps
                if (fromy < toy) {
                    return toy + this.cellPY;
                } else {
                    return toy - this.cellPY;
                }
            } else {
                // short (max 1 level) distance, basic curve
                return toy;
            }
        },
        
        getFillColor: function (node, sunlit) {
            var definition = node.definition;
            if (this.tribeNodes.head.upgrades.hasUpgrade(definition.id)) {
                return sunlit ? "#444" : "#ccc";
            }
            var isAvailable = GameGlobals.playerActionsHelper.checkRequirements(definition.id, false).value > 0;
            if (isAvailable) {
                return sunlit ? "#aaa" : "#777";
            }
            return sunlit ? "#aaa" : "#777";
        }
        
    });
    
    return UITechTreeHelper;
});
