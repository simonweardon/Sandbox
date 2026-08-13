#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interactable.h"
#include "VaultTerminal.generated.h"

class UMaterialInstanceDynamic;
class UPointLightComponent;
class UStaticMeshComponent;

/** The goal. Interacting with it ends the demo. */
UCLASS()
class VANTAGE_API AVaultTerminal : public AActor, public IInteractable
{
	GENERATED_BODY()

public:
	AVaultTerminal();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	// IInteractable
	virtual FText GetInteractionPrompt() const override;
	virtual void Interact(AVantageCharacter* Interactor) override;

private:
	UPROPERTY(VisibleAnywhere, Category = "Vantage")
	TObjectPtr<USceneComponent> Pivot;

	UPROPERTY(VisibleAnywhere, Category = "Vantage")
	TObjectPtr<UStaticMeshComponent> Plinth;

	UPROPERTY(VisibleAnywhere, Category = "Vantage")
	TObjectPtr<UStaticMeshComponent> Core;

	UPROPERTY(VisibleAnywhere, Category = "Vantage")
	TObjectPtr<UPointLightComponent> CoreLight;

	UPROPERTY(Transient)
	TObjectPtr<UMaterialInstanceDynamic> CoreMaterial;

	float Phase = 0.f;
	bool bActivated = false;
};
