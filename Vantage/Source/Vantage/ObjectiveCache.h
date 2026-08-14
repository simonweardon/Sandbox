#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ObjectiveCache.generated.h"

class UPointLightComponent;
class UStaticMeshComponent;

/**
 * The thing you came for, sitting in the back of the vault ruin.
 *
 * Picked up by walking into it - a proximity check in Tick rather than an
 * overlap delegate, because it already ticks for the glow and a distance
 * comparison has fewer ways to silently not fire.
 */
UCLASS()
class VANTAGE_API AObjectiveCache : public AActor
{
	GENERATED_BODY()

public:
	AObjectiveCache();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	/** How close the player has to get to take it. */
	UPROPERTY(EditAnywhere, Category = "Vantage")
	float PickupRadius = 170.f;

private:
	UPROPERTY(VisibleAnywhere, Category = "Vantage") TObjectPtr<USceneComponent> Pivot;
	UPROPERTY(VisibleAnywhere, Category = "Vantage") TObjectPtr<UStaticMeshComponent> Plinth;
	UPROPERTY(VisibleAnywhere, Category = "Vantage") TObjectPtr<UStaticMeshComponent> Case;
	UPROPERTY(VisibleAnywhere, Category = "Vantage") TObjectPtr<UStaticMeshComponent> Core;
	UPROPERTY(VisibleAnywhere, Category = "Vantage") TObjectPtr<UPointLightComponent> Glow;

	float Phase = 0.f;
	bool bTaken = false;
};
