#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "FacilityBuilder.generated.h"

class UPointLightComponent;
class UStaticMesh;
class UStaticMeshComponent;

/**
 * Assembles the whole playable space out of engine primitive cubes at runtime.
 *
 * This exists so the project needs no .umap and no imported meshes: every wall,
 * floor and prop below is a scaled /Engine/BasicShapes/Cube with a dynamic
 * material instance for colour. Coordinates are in centimetres, with the floor
 * surface at Z = 0 and the player entering from the west end of the atrium.
 */
UCLASS()
class VANTAGE_API AFacilityBuilder : public AActor
{
	GENERATED_BODY()

public:
	AFacilityBuilder();

	/** Builds everything. Call once, before the player pawn spawns. */
	void Build();

private:
	/** Axis aligned box. Centre and half extent are both world space, in cm. */
	UStaticMeshComponent* AddBox(const FVector& Centre, const FVector& HalfExtent, const FLinearColor& Colour);

	void AddLight(const FVector& Location, const FLinearColor& Colour, float Intensity, float Radius);

	/** The single dim key light. A component rather than an ADirectionalLight
	 *  actor, because light actors default to Stationary mobility and cannot be
	 *  placed at runtime without complaint. */
	void AddKeyLight();

	void BuildAtrium();
	void BuildCorridor();
	void BuildVault();
	void BuildFurnishings();

	UPROPERTY(Transient)
	TObjectPtr<UStaticMesh> CubeMesh;

	UPROPERTY(Transient)
	TArray<TObjectPtr<UActorComponent>> BuiltComponents;
};
