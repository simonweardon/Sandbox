#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "Interactable.h"
#include "SlidingDoor.generated.h"

class UStaticMeshComponent;

/**
 * A two panel blast door. Stays sealed until the player is carrying the number
 * of shards the game mode asks for, then the halves slide apart into the wall.
 */
UCLASS()
class VANTAGE_API ASlidingDoor : public AActor, public IInteractable
{
	GENERATED_BODY()

public:
	ASlidingDoor();

	virtual void BeginPlay() override;
	virtual void Tick(float DeltaSeconds) override;

	// IInteractable
	virtual FText GetInteractionPrompt() const override;
	virtual bool CanInteract(const AVantageCharacter* Interactor) const override;
	virtual void Interact(AVantageCharacter* Interactor) override;

	/** Half width of one panel, in centimetres. */
	UPROPERTY(EditAnywhere, Category = "Vantage")
	float PanelHalfWidth = 90.f;

	/** Half height of the doorway. */
	UPROPERTY(EditAnywhere, Category = "Vantage")
	float PanelHalfHeight = 150.f;

	/** How far each panel travels along Y when opening. */
	UPROPERTY(EditAnywhere, Category = "Vantage")
	float OpenDistance = 185.f;

	UPROPERTY(EditAnywhere, Category = "Vantage")
	float OpenSeconds = 1.6f;

private:
	void ApplyPanelPositions();

	UPROPERTY(VisibleAnywhere, Category = "Vantage")
	TObjectPtr<USceneComponent> Pivot;

	UPROPERTY(VisibleAnywhere, Category = "Vantage")
	TObjectPtr<UStaticMeshComponent> LeftPanel;

	UPROPERTY(VisibleAnywhere, Category = "Vantage")
	TObjectPtr<UStaticMeshComponent> RightPanel;

	/** 0 sealed, 1 fully open. */
	float OpenAlpha = 0.f;
	bool bOpening = false;
	bool bReportedOpen = false;
};
