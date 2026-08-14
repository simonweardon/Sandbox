#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "DesertBuilder.generated.h"

class UStaticMesh;
class UStaticMeshComponent;

/**
 * Builds the whole map at runtime: desert floor, a ring of ruined towers, cover
 * near the middle, and the sky and lighting that go with them.
 *
 * Everything is scaled primitives from /Engine/BasicShapes, so the project
 * still needs no imported art and no .umap. Coordinates are in centimetres and
 * the sand surface is Z = 0. The player starts at the origin.
 */
UCLASS()
class VANTAGE_API ADesertBuilder : public AActor
{
	GENERATED_BODY()

public:
	ADesertBuilder();

	/** Builds everything. Call once, before the player pawn spawns. */
	void Build();

	/** Half width of the area zombies are allowed to spawn in. */
	static constexpr float ArenaRadius = 3200.f;

	/** The cache sits at the back of the vault ruin, well beyond the horde. */
	static const FVector CacheLocation;

	/** Ground floor of the vault ruin, for the HUD to point at. */
	static const FVector VaultDoorLocation;

	/** Where the run started, and where the cache has to be carried back to. */
	static const FVector ExtractionLocation;

private:
	UStaticMeshComponent* AddShape(
		UStaticMesh* Mesh,
		const FVector& Centre,
		const FVector& LocalScale,
		const FRotator& Rotation,
		const FLinearColor& Colour,
		bool bCollides = true);

	UStaticMeshComponent* AddBox(const FVector& Centre, const FVector& HalfExtent, const FLinearColor& Colour, bool bCollides = true);
	UStaticMeshComponent* AddRotatedBox(const FVector& Centre, const FVector& HalfExtent, const FRotator& Rotation, const FLinearColor& Colour, bool bCollides = true);
	UStaticMeshComponent* AddSphere(const FVector& Centre, float Radius, const FLinearColor& Colour, bool bCollides = true);
	UStaticMeshComponent* AddPillar(const FVector& Centre, float Radius, float HalfHeight, const FLinearColor& Colour, bool bCollides = true);

	/** Sun, sky, fog and ambient. Without these the desert renders black. */
	void BuildSky();

	void BuildGround();

	/** A single ruin: shaft, glazing, floor bands, broken crown and rubble. */
	void AddRuinedTower(const FVector& Base, float Width, float Depth, float Height, int32 Seed);

	/** Untextured dark blocks on the horizon, for skyline depth at no cost. */
	void AddDistantSkyline();

	/** Dunes and mesas, to stop the horizon being a flat line. */
	void AddDunes();

	/** The ring of ruins the fight happens inside. */
	void BuildCity();

	/** Waist-high cover, wrecks and rubble near the middle. */
	void BuildCover();

	/** The one ruin you can walk into, with the cache in the back of it. */
	void BuildVaultRuin();

	/** Lit pad at the origin, so the way back is findable from a distance. */
	void BuildExtractionPad();

	UPROPERTY(Transient) TObjectPtr<UStaticMesh> CubeMesh;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> CylinderMesh;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> SphereMesh;
	UPROPERTY(Transient) TObjectPtr<UStaticMesh> ConeMesh;

	UPROPERTY(Transient) TArray<TObjectPtr<UActorComponent>> BuiltComponents;
};
