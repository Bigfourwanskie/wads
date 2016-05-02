// A system that updates a Sector's MovementOptionsComponent based on its neighbours and improvements
define([
    'ash',
    'game/constants/PositionConstants',
    'game/constants/LocaleConstants',
    'game/nodes/sector/SectorNode',
    'game/nodes/PlayerLocationNode',
    'game/components/common/PositionComponent',
    'game/components/common/CampComponent',
    'game/components/sector/MovementOptionsComponent',
    'game/components/sector/PassagesComponent',
    'game/components/sector/SectorControlComponent',
    'game/components/sector/SectorStatusComponent',
    'game/components/sector/SectorFeaturesComponent',
    'game/components/sector/SectorControlComponent',
    'game/components/sector/improvements/SectorImprovementsComponent',
], function (Ash,
	PositionConstants,
	LocaleConstants,
	SectorNode,
	PlayerLocationNode,
	PositionComponent,
	CampComponent,
	MovementOptionsComponent,
	PassagesComponent,
	SectorConrolComponent,
	SectorStatusComponent,
	SectorFeaturesComponent,
	SectorControlComponent,
	SectorImprovementsComponent) {
	
    var SectorStatusSystem = Ash.System.extend({
	    
		sectorNodes: null,
		playerLocationNodes: null,
		
		movementHelper: null,
		levelHelper: null,
		
		playerMovedSignal: null,
		
		neighboursDict: {},
		
		constructor: function (movementHelper, levelHelper, playerMovedSignal) {
			this.movementHelper = movementHelper;
			this.levelHelper = levelHelper;
			this.playerMovedSignal = playerMovedSignal;
		},
	
		addToEngine: function (engine) {
			this.sectorNodes = engine.getNodeList(SectorNode);
			this.playerLocationNodes = engine.getNodeList(PlayerLocationNode);

			var sys = this;
			this.playerMovedSignal.add(function () {
				sys.update();
			});
		},
	
        removeFromEngine: function (engine) {
			this.sectorNodes = null;
		},
	
		update: function () {
			if (this.playerLocationNodes.head)
				this.updateSector(this.playerLocationNodes.head.entity);
		},
		
		updateSector: function (entity) {
			var positionComponent = entity.get(PositionComponent);
			var sectorStatusComponent = entity.get(SectorStatusComponent);
			var featuresComponent = entity.get(SectorFeaturesComponent);
			var passagesComponent = entity.get(PassagesComponent);
			var hasEnemies = entity.get(SectorControlComponent).maxSectorEnemies > 0;
			
			if (!positionComponent) return;
			
			var levelEntity = this.levelHelper.getLevelEntityForSector(entity);
			
			var isScouted = sectorStatusComponent.scouted;
			var hasCampLevel = levelEntity.has(CampComponent);
			var hasCampSector = entity.has(CampComponent);
			
			this.updateGangs(entity);
			this.updateMovementOptions(entity);
			
			sectorStatusComponent.canBuildCamp = isScouted && !hasCampLevel && featuresComponent.canHaveCamp() && !passagesComponent.passageUp && !passagesComponent.passageDown && !hasEnemies;
			
			if (hasCampSector && !hasCampLevel) levelEntity.add(entity.get(CampComponent));
		},
		
		updateGangs: function (entity) {
			var sectorControlComponent = entity.get(SectorControlComponent);
			var positionComponent = entity.get(PositionComponent);
			
			var sectorKey = this.getSectorKey(positionComponent);
			if (!this.neighboursDict[sectorKey]) this.findNeighbours(entity);
			var sys = this;
			
			function checkNeighbour(direction) {
				var localeId = LocaleConstants.getPassageLocaleId(direction === 0 ? 0 : 1);
				var currentEnemies = sectorControlComponent.getCurrentEnemies(localeId);
				
				var neighbour = sys.getNeighbour(sectorKey, direction);
				
				if (neighbour) {
					var neighbourSectorControlComponent = neighbour.get(SectorControlComponent);
					var neighbourLocaleID = LocaleConstants.getPassageLocaleId(direction === 0 ? 1 : 0);
					var neighbourEnemies = neighbourSectorControlComponent.getCurrentEnemies(neighbourLocaleID);
					var targetEnemies = Math.min(currentEnemies, neighbourEnemies);
					
					if (targetEnemies < currentEnemies) {
						console.log("WARN: set sector control for " + localeId + " at " + positionComponent.level + "-" + positionComponent.sectorId() + " | " + targetEnemies + " < " + currentEnemies);
						sectorControlComponent.currentLocaleEnemies[localeId] -= (currentEnemies - targetEnemies);
					}
				}
			}
			
			for (var i in PositionConstants.getLevelDirections()) {
				var direction = PositionConstants.getLevelDirections()[i];
				checkNeighbour(direction);
			}
		},
		
		updateMovementOptions: function (entity) {
			var movementOptions = entity.get(MovementOptionsComponent);
			var passagesComponent = entity.get(PassagesComponent);
			var positionComponent = entity.get(PositionComponent);
			
			var sectorKey = this.getSectorKey(positionComponent);
			if (!this.neighboursDict[sectorKey]) this.findNeighbours(entity);
			
			// Allow n/s/w/e movement if neighbour exists and there is no active blocker
			for (var i in PositionConstants.getLevelDirections()) {
				var direction = PositionConstants.getLevelDirections()[i];
				var neighbour = this.getNeighbour(sectorKey, direction);
				movementOptions.canMoveTo[direction] = neighbour != null;
				movementOptions.canMoveTo[direction] = movementOptions.canMoveTo[direction] && !this.movementHelper.isBlocked(entity, direction);
				movementOptions.cantMoveToReason[direction] = this.movementHelper.getBlockedReason(entity, direction);
				if (!neighbour) movementOptions.cantMoveToReason[direction] = "Nothing here.";
			}
			
			// Allow up/down movement if passages exists
			movementOptions.canMoveTo[PositionConstants.DIRECTION_UP] = passagesComponent != null && !this.movementHelper.isBlocked(entity, PositionConstants.DIRECTION_UP);
			movementOptions.cantMoveToReason[PositionConstants.DIRECTION_UP] = this.movementHelper.getBlockedReason(entity, PositionConstants.DIRECTION_UP);
			movementOptions.canMoveTo[PositionConstants.DIRECTION_DOWN] = passagesComponent != null && !this.movementHelper.isBlocked(entity, PositionConstants.DIRECTION_DOWN);
			movementOptions.cantMoveToReason[PositionConstants.DIRECTION_DOWN] = this.movementHelper.getBlockedReason(entity, PositionConstants.DIRECTION_DOWN);
		},
		
		getNeighbour: function (sectorKey, direction) {
            switch (direction) {
			case PositionConstants.DIRECTION_NORTH: return this.neighboursDict[sectorKey].north;
			case PositionConstants.DIRECTION_EAST: return this.neighboursDict[sectorKey].east;
			case PositionConstants.DIRECTION_SOUTH: return this.neighboursDict[sectorKey].south;
			case PositionConstants.DIRECTION_WEST: return this.neighboursDict[sectorKey].west;
			case PositionConstants.DIRECTION_NE: return this.neighboursDict[sectorKey].ne;
			case PositionConstants.DIRECTION_SE: return this.neighboursDict[sectorKey].se;
			case PositionConstants.DIRECTION_SW: return this.neighboursDict[sectorKey].sw;
			case PositionConstants.DIRECTION_NW: return this.neighboursDict[sectorKey].nw;
            default:
                return null;
            }
		},
		
		findNeighbours: function (entity) {
			var positionComponent = entity.get(PositionComponent);
			var sectorKey = this.getSectorKey(positionComponent);
			
			var otherPositionComponent;
			this.neighboursDict[sectorKey] = {};
			for (var otherNode = this.sectorNodes.head; otherNode; otherNode = otherNode.next) {
				otherPositionComponent = otherNode.entity.get(PositionComponent);
					
				if (positionComponent.level === otherPositionComponent.level) {
					if (positionComponent.sectorY === otherPositionComponent.sectorY) {
						if (positionComponent.sectorX - 1 === otherPositionComponent.sectorX) {
							this.neighboursDict[sectorKey].west = otherNode.entity;
						}
						if (positionComponent.sectorX + 1 === otherPositionComponent.sectorX) {
							this.neighboursDict[sectorKey].east = otherNode.entity;
						}
					}
					
					if (positionComponent.sectorX === otherPositionComponent.sectorX) {
						if (positionComponent.sectorY - 1 === otherPositionComponent.sectorY) {
							this.neighboursDict[sectorKey].north = otherNode.entity;
						}
						if (positionComponent.sectorY + 1 === otherPositionComponent.sectorY) {
							this.neighboursDict[sectorKey].south = otherNode.entity;
						}
					}
						
					if (positionComponent.sectorX - 1 === otherPositionComponent.sectorX && positionComponent.sectorY - 1 === otherPositionComponent.sectorY) {
						this.neighboursDict[sectorKey].nw = otherNode.entity;
					}
						
					if (positionComponent.sectorX - 1 === otherPositionComponent.sectorX && positionComponent.sectorY + 1 === otherPositionComponent.sectorY) {
						this.neighboursDict[sectorKey].sw = otherNode.entity;
					}
						
					if (positionComponent.sectorX + 1 === otherPositionComponent.sectorX && positionComponent.sectorY - 1 === otherPositionComponent.sectorY) {
						this.neighboursDict[sectorKey].ne = otherNode.entity;
					}
						
					if (positionComponent.sectorX + 1 === otherPositionComponent.sectorX && positionComponent.sectorY + 1 === otherPositionComponent.sectorY) {
						this.neighboursDict[sectorKey].se = otherNode.entity;
					}
				}
					
				if (positionComponent.sectorId() === otherPositionComponent.sectorId()) {
					if (positionComponent.level - 1 === otherPositionComponent.level) {
						this.neighboursDict[sectorKey].down = otherNode.entity;
					}
					if (positionComponent.level + 1 === otherPositionComponent.level) {
						this.neighboursDict[sectorKey].up = otherNode.entity;
					}
				}
			}
		},
		
		getSectorKey: function (positionComponent) {
			return positionComponent.level + "." + positionComponent.sectorId();
		}
        
    });

    return SectorStatusSystem;
});