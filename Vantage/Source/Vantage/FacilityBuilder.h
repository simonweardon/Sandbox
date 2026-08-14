#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "FacilityBuilder.generated.h"

class UPointLightComponent;
class UStaticMesh;
class UStaticMeshComponent;

/**
 * Assembles the whole playable space at runtime from the primitive meshes that
 * ship with the engine, so the project needs no .umap and no imported art.
 *
 * Everything is drawn from /Engine/BasicShapes - Cube, Cylinder, Sphere and
 * Cone - scaled and tinted with dynamic material instances. Coordinates are in
 * centimetres, the floor surface is Z = 0, and the player enters from the west
 * end of the atrium heading east.
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
	// --- primitive helpers -------------------------------------------------

	/** Every other helper funnels through this one. Scale is in mesh local space. */
	UStaticMeshComponent* AddShape(
		UStaticMesh* Mesh,
		const FVector& Centre,
		const FVector& LocalScale,
		const FRotator& Rotation,
		const FLinearColor& Colour,
		bool bCollides = true);

	/** Axis aligned box. Centre and half extent are world space, in cm. */
	UStaticMeshComponent* AddBox(const FVector& Centre, const FVector& HalfExtent, const FLinearColor& Colour, bool bCollides = true);

	/** Upright cylinder. */
	UStaticMeshComponent* AddPillar(const FVector& Centre, float Radius, float HalfHeight, const FLinearColor& Colour, bool bCollides = true);

	/** Cylinder spanning two points, oriented along the line between them. */
	UStaticMeshComponent* AddPipe(const FVector& Start, const FVector& End, float Radius, const FLinearColor& Colour, bool bCollides = false);

	UStaticMeshComponent* AddSphere(const FVector& Centre, float Radius, const FLinearColor& Colour, bool bCollides = true);

	void AddLight(const FVector& Location, const FLinearColor& Colour, float Intensity, float Radius);

	/** Point light plus the housing and diffuser plate that sell it as a fixture. */
	void AddCeilingFixture(const FVector& CeilingPoint, const FLinearColor& Colour, float Intensity, float Radius);

	/** The single dim key light. A component rather than an ADirectionalLight
	 *  actor, because light actors default to Stationary mobility and cannot be
	 *  placed at runtime without complaint. */
	void AddKeyLight();

	// --- composite props ---------------------------------------------------

	/** Cylinder with collars at both ends, to break up a bare vertical run. */
	void AddColumn(float X, float Y, float Height, float Radius);

	/** Pipe run with collars at intervals along it. */
	void AddPipeRun(const FVector& Start, const FVector& End, float Radius, int32 CollarCount);

	/** Posts and a top rail along a straight edge. */
	void AddRailing(const FVector& Start, const FVector& End, float Height, int32 PostCount);

	/** Vertical seams that keep a long flat wall from reading as one slab. */
	void AddWallSeams(const FVector& Start, const FVector& End, float Height, int32 Count);

	// --- rooms -------------------------------------------------------------

	void BuildAtrium();
	void BuildCorridor();
	void BuildVault();
	void BuildFurnishings();

	UPROPERTY(Transient) TObjectPtr<UStaticMesh> CubeMesh;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> CylinderMesh;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> SphereMesh;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> ConeMesh;

	UPROPERTY(Transient) TArray<TObjectPtr<UActorComponent>> BuiltComponents;
};
