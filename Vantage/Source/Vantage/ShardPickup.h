#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interactable.h"
#include "ShardPickup.generated.h"

class UPointLightComponent;
class UStaticMeshComponent;

/** A collectible that hovers, spins, and lights its own alcove. */
UCLASS()
class VANTAGE_API AShardPickup : public AActor, public IInteractable
{
	GENERATED_BODY()

public:
	AShardPickup();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	// IInteractable
	virtual FText GetInteractionPrompt() const override;
	virtual void Interact(AVantageCharacter* Interactor) override;

	/** Tint for both the mesh and the glow. Set before BeginPlay. */
	UPROPERTY(EditAnywhere, Category = "Vantage")
	FLinearColor Tint = FLinearColor(0.05f, 0.85f, 1.f);

private:
	UPROPERTY(VisibleAnywhere, Category = "Vantage")
	TObjectPtr<USceneComponent> Pivot;

	UPROPERTY(VisibleAnywhere, Category = "Vantage")
	TObjectPtr<UStaticMeshComponent> Mesh;

	UPROPERTY(VisibleAnywhere, Category = "Vantage")
	TObjectPtr<UPointLightComponent> Glow;

	float Phase = 0.f;
};
